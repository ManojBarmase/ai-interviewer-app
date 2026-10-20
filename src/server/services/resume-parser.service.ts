import 'server-only';

import {
  AppError,
  BadRequestError,
  ValidationError,
} from '@/server/errors/AppError';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFParser = require('pdf2json');

export interface ParsedResumeResult {
  text: string;
  bytesParsed: number;
  characterCount: number;
}

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB maximum
export const ALLOWED_MIME_TYPES = ['application/pdf', 'application/x-pdf'];
export const PARSER_TIMEOUT_MS = 15000; // 15 seconds

export class ResumeParserService {
  /**
   * Validates uploaded file type, size, extension, and PDF magic bytes
   */
  async validatePdfFile(file: unknown): Promise<Buffer> {
    if (!file || typeof file === 'string' || !(file instanceof Blob)) {
      throw new BadRequestError(
        "No resume file provided. Please attach a valid file under the 'file' key.",
      );
    }

    if (file.size === 0) {
      throw new BadRequestError(
        'Uploaded file is empty (0 bytes). Please upload a valid resume.',
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const fileSizeMb = (file.size / (1024 * 1024)).toFixed(2);
      throw new AppError(
        `File size (${fileSizeMb}MB) exceeds the maximum allowed limit of 5MB.`,
        413,
        'PAYLOAD_TOO_LARGE',
      );
    }

    const declaredMime = (file.type || '').toLowerCase().trim();
    if (declaredMime && !ALLOWED_MIME_TYPES.includes(declaredMime)) {
      throw new AppError(
        `Unsupported file type (${declaredMime}). Only PDF documents (.pdf) are supported.`,
        415,
        'UNSUPPORTED_MEDIA_TYPE',
      );
    }

    const fileName = (file as File).name || '';
    if (fileName && !fileName.toLowerCase().endsWith('.pdf')) {
      throw new AppError(
        'Invalid file extension. Please upload a genuine PDF file with a .pdf extension.',
        415,
        'UNSUPPORTED_MEDIA_TYPE',
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 5) {
      throw new BadRequestError(
        'File corrupted or too small to be a valid PDF document.',
      );
    }

    const fileHeader = buffer.subarray(0, 5).toString('ascii');
    if (!fileHeader.startsWith('%PDF-')) {
      throw new AppError(
        'File validation failed: Binary signature does not match PDF standard (%PDF-).',
        415,
        'UNSUPPORTED_MEDIA_TYPE',
      );
    }

    return buffer;
  }

  /**
   * Extracts raw text from the validated PDF buffer with timeout guard
   */
  async parsePdfBuffer(buffer: Buffer): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const pdfParser = new PDFParser(null, 1);
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(
            new AppError(
              'PDF parsing timed out after 15 seconds. The file may be password protected or corrupted.',
              504,
              'PARSER_TIMEOUT',
            ),
          );
        }
      }, PARSER_TIMEOUT_MS);

      pdfParser.on('pdfParser_dataError', (errData: unknown) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          const errorObj = errData as
            { parserError?: string } | string | undefined;
          const errorMsg =
            (typeof errorObj === 'object' && errorObj !== null
              ? errorObj.parserError
              : errorObj) || 'PDF parser encountered an error';
          reject(
            new AppError(
              typeof errorMsg === 'string'
                ? errorMsg
                : JSON.stringify(errorMsg),
              422,
              'PARSER_DATA_ERROR',
            ),
          );
        }
      });

      pdfParser.on('pdfParser_dataReady', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try {
            resolve(pdfParser.getRawTextContent() || '');
          } catch (e) {
            reject(e);
          }
        }
      });

      try {
        pdfParser.parseBuffer(buffer);
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    });
  }

  /**
   * Cleans, decodes, and normalizes extracted PDF text
   */
  cleanText(rawContent: string): string {
    let content = rawContent;
    try {
      content = decodeURIComponent(content);
    } catch {
      // Use raw content if decoding fails
    }

    return content
      .replace(/----------------Page \(\d+\) Break----------------/g, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  /**
   * Orchestrates PDF validation, text extraction, cleaning, and truncation
   */
  async parseResume(file: unknown): Promise<ParsedResumeResult> {
    const buffer = await this.validatePdfFile(file);
    const rawParsedText = await this.parsePdfBuffer(buffer);
    const cleanedText = this.cleanText(rawParsedText);

    if (!cleanedText || cleanedText.length < 20) {
      throw new ValidationError(
        'The uploaded PDF appears to be empty or contains only scanned images without selectable text.',
      );
    }

    const truncatedText = cleanedText.substring(0, 5000);

    return {
      text: truncatedText,
      bytesParsed: buffer.length,
      characterCount: truncatedText.length,
    };
  }
}

export const resumeParserService = new ResumeParserService();
