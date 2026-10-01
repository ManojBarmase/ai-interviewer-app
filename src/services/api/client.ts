/**
 * @file API client singleton
 * @description Typed fetch wrapper used by all services.
 * Centralizes base URL, auth headers, and error handling.
 *
 * Usage:
 *   import { apiClient } from '@/services/api/client';
 *   const data = await apiClient.get<ResponseType>('/endpoint');
 */

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

type ApiResponse<T> = {
  data: T;
  status: number;
};

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  { body, ...options }: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    ...options,
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as T;
  return { data, status: response.status };
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'GET', ...options }),

  post: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'POST', body, ...options }),

  put: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'PUT', body, ...options }),

  patch: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'PATCH', body, ...options }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'DELETE', ...options }),
} as const;

export { ApiError };
