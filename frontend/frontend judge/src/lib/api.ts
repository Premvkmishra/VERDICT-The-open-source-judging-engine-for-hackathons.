/**
 * Shared Verdict API client.
 *
 * Every network call in the app goes through here. The contract
 * (API-CONTRACT.yaml) guarantees:
 *   list      -> { data: [...], meta?: {...} }
 *   single    -> { data: {...} }
 *   error     -> { error: { code, message, details? } }
 *
 * Auth is a `verdict_session` cookie set by POST /auth/login, so every request
 * is sent with credentials included and there is no token to manage.
 */

export const API_BASE_URL: string =
  (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? "/api/v1";

export type ApiErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "deadline_passed"
  | "event_not_open"
  | "conflict"
  | "rate_limited"
  | "internal_error";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown> | undefined;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown> | undefined,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown> | undefined;
}

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 401:
      return "unauthenticated";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation_error";
    case 429:
      return "rate_limited";
    default:
      return "internal_error";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Perform a request and return the parsed envelope.
 * Throws ApiError on any non-2xx response.
 */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<Envelope<T>> {
  const { method = "GET", body, query, signal } = options;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: "include",
      ...(signal ? { signal } : {}),
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (cause) {
    if ((cause as Error)?.name === "AbortError") throw cause;
    throw new ApiError(0, "internal_error", "Can't reach the server. Check your connection and try again.");
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  const text = await response.text();
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    const envelope = payload as { error?: { code?: ApiErrorCode; message?: string; details?: Record<string, unknown> } } | undefined;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? codeForStatus(response.status),
      envelope?.error?.message ?? defaultMessage(response.status),
      envelope?.error?.details,
    );
  }

  const envelope = (payload ?? {}) as Envelope<T>;
  return { data: envelope.data as T, meta: envelope.meta };
}

function defaultMessage(status: number): string {
  switch (status) {
    case 401:
      return "You need to sign in to do that.";
    case 403:
      return "You don't have access to this.";
    case 404:
      return "We couldn't find that.";
    case 409:
      return "That conflicts with something already recorded.";
    case 422:
      return "Some required answers are missing.";
    case 429:
      return "Too many attempts — please wait a moment.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Convenience helpers — all return the unwrapped `data`. */
export async function apiGet<T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal): Promise<T> {
  return (await request<T>(path, { method: "GET", ...(query ? { query } : {}), ...(signal ? { signal } : {}) })).data;
}

export async function apiGetList<T>(
  path: string,
  query?: RequestOptions["query"],
): Promise<{ items: T[]; meta?: Record<string, unknown> | undefined }> {
  const res = await request<T[]>(path, { method: "GET", ...(query ? { query } : {}) });
  return { items: Array.isArray(res.data) ? res.data : [], meta: res.meta };
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return (await request<T>(path, { method: "POST", body })).data;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return (await request<T>(path, { method: "PATCH", body })).data;
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return (await request<T>(path, { method: "PUT", body })).data;
}

export async function apiDelete(path: string): Promise<void> {
  await request<void>(path, { method: "DELETE" });
}
