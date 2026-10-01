/**
 * @file API contract types
 * @description Typed shapes for all API request/response payloads.
 * Every service call must return one of these types.
 */

// ─── Generic API Wrapper ───────────────────────────────────────────────────

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

export type ApiErrorResponse = {
  success: false;
  error: string;
  statusCode: number;
  details?: Record<string, string[]>;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ─── Pagination ────────────────────────────────────────────────────────────

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PaginatedResponse<T> = ApiSuccessResponse<T[]> & {
  meta: PaginationMeta;
};

// ─── Request Helpers ────────────────────────────────────────────────────────

export type PaginationParams = {
  page?: number;
  pageSize?: number;
};

export type SortOrder = 'asc' | 'desc';

export type SortParams<TField extends string = string> = {
  sortBy?: TField;
  sortOrder?: SortOrder;
};
