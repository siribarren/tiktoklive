export type ApiLikePayload = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    return null;
  }
}

export function resolveApiErrorMessage(
  response: Response,
  payload: ApiLikePayload | null,
  fallbackMessage: string
): string {
  if (response.status === 401) {
    return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  }

  if (response.status === 403) {
    return 'No tienes permisos para realizar esta acción.';
  }

  const explicitMessage = [payload?.error, payload?.message].find(
    (value): value is string => Boolean(value && value.trim())
  );
  if (explicitMessage) {
    return explicitMessage;
  }

  if (!response.ok) {
    return `${fallbackMessage} (HTTP ${response.status})`;
  }

  return fallbackMessage;
}
