import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  AppError,
  BadRequestError,
  ValidationError,
} from '@/server/errors/AppError';
import {
  ResumeParserService,
  resumeParserService,
} from '@/server/services/resume-parser.service';

function makeMockBlob(
  content: string,
  type = 'application/pdf',
  name = 'resume.pdf',
): Blob {
  const blob =
    typeof File !== 'undefined'
      ? new File([content], name, { type })
      : new Blob([content], { type });

  if (!('name' in blob)) {
    Object.defineProperty(blob, 'name', { value: name, configurable: true });
  }

  return blob;
}

describe('ResumeParserService', () => {
  let service: ResumeParserService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ResumeParserService();
  });

  describe('validatePdfFile', () => {
    it('throws BadRequestError when file is null', async () => {
      await expect(service.validatePdfFile(null)).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws BadRequestError when file is a string', async () => {
      await expect(
        service.validatePdfFile('invalid-string-path.pdf'),
      ).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError when file.size is 0', async () => {
      const emptyBlob = makeMockBlob('');
      await expect(service.validatePdfFile(emptyBlob)).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws AppError with status 413 when file.size > 5MB', async () => {
      const oversizedBlob = makeMockBlob('%PDF-1.4 Oversized dummy content');
      Object.defineProperty(oversizedBlob, 'size', {
        value: 5 * 1024 * 1024 + 1024,
      });

      const promise = service.validatePdfFile(oversizedBlob);
      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
      });
    });

    it('throws AppError with status 415 when mime type is image/png', async () => {
      const pngBlob = makeMockBlob(
        '%PDF-1.4 invalid mime',
        'image/png',
        'resume.pdf',
      );
      const promise = service.validatePdfFile(pngBlob);
      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
    });

    it('throws AppError with status 415 when file.name is resume.docx', async () => {
      const docxBlob = makeMockBlob(
        '%PDF-1.4 docx extension',
        'application/pdf',
        'resume.docx',
      );
      const promise = service.validatePdfFile(docxBlob);
      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
    });

    it('throws BadRequestError when buffer is less than 5 bytes', async () => {
      const smallBlob = makeMockBlob('PDF', 'application/pdf', 'resume.pdf');
      await expect(service.validatePdfFile(smallBlob)).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws AppError with status 415 when PDF magic bytes do not match (%PDF-)', async () => {
      const nonPdfBlob = makeMockBlob(
        'NOTPDF-1.4 this is plain text',
        'application/pdf',
        'resume.pdf',
      );
      const promise = service.validatePdfFile(nonPdfBlob);
      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
    });

    it('returns a Buffer when all validations pass', async () => {
      const validPdfBlob = makeMockBlob(
        '%PDF-1.4 Sample valid PDF header and content',
        'application/pdf',
        'resume.pdf',
      );
      const result = await service.validatePdfFile(validPdfBlob);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('cleanText', () => {
    it('removes page break markers ----------------Page (N) Break----------------', () => {
      const input =
        'Experience Page 1\n----------------Page (1) Break----------------\nSkills Page 2';
      const output = service.cleanText(input);
      expect(output).not.toContain('----------------Page');
      expect(output).toContain('Experience Page 1');
      expect(output).toContain('Skills Page 2');
    });

    it('normalizes multiple newlines to double newline', () => {
      const input = 'Header\n\n\n\n\nBody Paragraph';
      const output = service.cleanText(input);
      expect(output).toBe('Header\n\nBody Paragraph');
    });

    it('normalizes multiple spaces to single space', () => {
      const input = 'Senior    Software     Engineer';
      const output = service.cleanText(input);
      expect(output).toBe('Senior Software Engineer');
    });

    it('trims leading and trailing whitespace', () => {
      const input = '   \n\n  Clean me up!  \n  ';
      const output = service.cleanText(input);
      expect(output).toBe('Clean me up!');
    });
  });

  describe('parseResume', () => {
    it('throws ValidationError when cleaned text length is less than 20 characters', async () => {
      const validPdfBlob = makeMockBlob(
        '%PDF-1.4 short',
        'application/pdf',
        'resume.pdf',
      );

      vi.spyOn(service, 'parsePdfBuffer').mockResolvedValue('Too short');

      await expect(service.parseResume(validPdfBlob)).rejects.toThrow(
        ValidationError,
      );
    });

    it('truncates output to 5000 characters maximum', async () => {
      const validPdfBlob = makeMockBlob(
        '%PDF-1.4 long document',
        'application/pdf',
        'resume.pdf',
      );

      const longText =
        'Software Engineer with extensive experience in Next.js. '.repeat(200); // > 10,000 chars

      vi.spyOn(service, 'parsePdfBuffer').mockResolvedValue(longText);

      const result = await service.parseResume(validPdfBlob);
      expect(result.text.length).toBe(5000);
      expect(result.characterCount).toBe(5000);
      expect(result.bytesParsed).toBeGreaterThan(0);
    });

    it('verifies default singleton export exists', () => {
      expect(resumeParserService).toBeInstanceOf(ResumeParserService);
    });
  });
});
