/** Read an already-decoded API body without coupling UI to a transport or Next. */
export function apiErrorMessage(value: unknown, fallback: string): string {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback;
}

/** Error responses may be empty, malformed JSON or an upstream HTML error page. */
export async function responseError(response: Response, fallback: string): Promise<string> {
  return apiErrorMessage(await response.json().catch(() => null), fallback) || fallback;
}
