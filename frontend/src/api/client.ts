export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
}

let cachedRuntimeApiBaseUrl: string | null = null;

export async function resolveApiBaseUrl() {
  if (cachedRuntimeApiBaseUrl) {
    return cachedRuntimeApiBaseUrl;
  }

  if (window.desktop?.getBackendBaseUrl) {
    cachedRuntimeApiBaseUrl = await window.desktop.getBackendBaseUrl();
    return cachedRuntimeApiBaseUrl;
  }

  cachedRuntimeApiBaseUrl = getApiBaseUrl();
  return cachedRuntimeApiBaseUrl;
}

export async function buildApiUrl(pathname: string) {
  if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
    return pathname;
  }

  const baseUrl = await resolveApiBaseUrl();
  return `${baseUrl}${pathname}`;
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let details: unknown = null;

    try {
      details = await response.json();
    } catch {
      details = null;
    }

    const message =
      typeof details === "object" &&
      details !== null &&
      "detail" in details &&
      typeof (details as { detail?: unknown }).detail === "string"
        ? (details as { detail: string }).detail
        : typeof details === "object" &&
            details !== null &&
            "detail" in details &&
            typeof (details as { detail?: { message?: unknown } }).detail?.message === "string"
          ? (details as { detail: { message: string } }).detail.message
          : `Request failed with status ${response.status}`;

    throw new ApiError(message, response.status, details);
  }

  return response.json() as Promise<T>;
}
