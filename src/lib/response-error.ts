import {diagnosticMessage,requestOperation} from "./request-diagnostics.ts";

/** Read an already-decoded API body without coupling UI to a transport or Next. */
export function apiErrorMessage(value: unknown, fallback: string): string {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback;
}

/** Error responses may be empty, malformed JSON or an upstream HTML error page. */
export async function responseError(response: Response, fallback: string): Promise<string> {
  const header=response.headers.get("X-EvaOrbit-Operation"),match=header?.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD) (\/\S+)$/);
  const operation=match?requestOperation(match[2],match[1]):response.url?requestOperation(response.url):undefined;
  return apiResponseError(await response.json().catch(() => null),response.status,fallback,operation);
}
export function apiResponseError(value:unknown,status:number,fallback:string,operation?:string):string {
  const message=apiErrorMessage(value,fallback)||fallback;
  if(status<400)return message;
  const code=value&&typeof value==="object"&&"code" in value&&typeof value.code==="string"?value.code:`http_${status}`;
  return diagnosticMessage(`${message} (HTTP ${status})`,code,operation);
}
