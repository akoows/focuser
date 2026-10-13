const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api")
  .replace(/\/+$/, "");

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

type ApiEnvelope<T> = {
  success: true;
  data: T;
};

type ApiErrorEnvelope = {
  success: false;
  error: {
    code?: string;
    message?: string;
  };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers = new Headers({ Accept: "application/json" });

  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (method !== "GET") headers.set("X-Focuser-Client", "web");

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? ` ${cause.message}` : "";
    throw new Error(`Não foi possível conectar à API do Focuser.${detail}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ApiError(
      response.ok ? "A API retornou uma resposta inválida." : `Falha na requisição (${response.status}).`,
      response.status,
      undefined
    );
  }

  if (!response.ok) {
    const errorPayload = payload as Partial<ApiErrorEnvelope>;
    const apiError = errorPayload.success === false && isRecord(errorPayload.error)
      ? errorPayload.error
      : undefined;
    const message = typeof apiError?.message === "string"
      ? apiError.message
      : `Falha na requisição (${response.status}).`;
    const code = typeof apiError?.code === "string" ? apiError.code : undefined;

    throw new ApiError(message, response.status, code);
  }

  if (
    !isRecord(payload)
    || payload.success !== true
    || !("data" in payload)
  ) {
    throw new ApiError("A API retornou uma resposta em formato inesperado.", response.status, undefined);
  }

  return (payload as ApiEnvelope<T>).data;
}
