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

export function buildApiUrl(pathname: string) {
  return `${getApiBaseUrl()}${pathname}`;
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
        : `Request failed with status ${response.status}`;

    throw new ApiError(message, response.status, details);
  }

  return response.json() as Promise<T>;
}
