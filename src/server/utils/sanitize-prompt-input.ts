/**
 * @file Prompt Sanitization Utility
 * @description Hardens LLM prompts against prompt injection, delimiter breakout attacks,
 * and context buffer overflow vulnerabilities.
 */

export const MAX_RESUME_LENGTH = 4000;
export const MAX_ROLE_LENGTH = 100;
export const MAX_TECH_STACK_ITEM_LENGTH = 50;

/**
 * Regex matching prompt injection patterns occurring at the beginning of lines:
 * e.g., "IGNORE PREVIOUS INSTRUCTIONS", "SYSTEM:", "USER:", "ASSISTANT:", "###"
 */
const INJECTION_LINE_START_REGEX =
  /^\s*(?:IGNORE(?:\s+PREVIOUS|\s+ALL)?|SYSTEM\s*:|USER\s*:|ASSISTANT\s*:|###+)/gim;

/**
 * Sanitizes untrusted user inputs before interpolation into AI system or evaluation prompts.
 *
 * 1. Strips all null bytes (\0)
 * 2. Removes markdown code block delimiters (```)
 * 3. Escapes triple-quote sequences (""" -> '')
 * 4. Strips line-start prompt injection keywords (IGNORE, SYSTEM:, USER:, ASSISTANT:, ###)
 * 5. Truncates the result to maxLength
 *
 * @param input - The raw untrusted text string
 * @param maxLength - Maximum allowed character length
 * @returns Sanitized and bounded string
 */
export function sanitizePromptInput(input: string, maxLength: number): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let sanitized = input
    // 1. Strip null bytes
    .replace(/\0/g, '')
    // 2. Remove markdown code block delimiters
    .replace(/```/g, '')
    // 3. Escape triple-quote sequences
    .replace(/"""/g, "''");

  // 4. Remove prompt injection keywords occurring at line beginnings
  sanitized = sanitized.replace(INJECTION_LINE_START_REGEX, '');

  // 5. Truncate to maximum specified length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized.trim();
}
