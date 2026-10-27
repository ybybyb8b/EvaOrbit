/** Diagnostics contain operation names, never request bodies, query values or credentials. */
export function requestOperation(path:string,method="GET"):string {
  let pathname="";
  try{pathname=new URL(path,"https://evaorbit.invalid").pathname;}catch{/* Invalid input gets a fixed label. */}
  if(!/^\/(?:api|eo-api)\/[A-Za-z0-9_./-]+$/.test(pathname))pathname="API request";
  const verb=["GET","POST","PUT","PATCH","DELETE","HEAD"].includes(method.toUpperCase())?method.toUpperCase():"REQUEST";
  return `${verb} ${pathname}`;
}

export function diagnosticMessage(message:string,code:string,operation?:string):string {
  const safeCode=/^[a-zA-Z0-9_.-]{1,80}$/.test(code)?code:"unexpected_error";
  const marker=`[EO:${safeCode}]`;
  const context=operation&&!message.includes(operation)?`${operation}: `:"";
  return `${context}${message}${message.includes(marker)?"":` ${marker}`}`;
}

export class RequestDiagnosticError extends Error {
  readonly code:string;
  constructor(message:string,code:string,operation:string){super(diagnosticMessage(message,code,operation));this.name="RequestDiagnosticError";this.code=code;}
}

export function requestFailure(error:unknown,operation:string,writeResultUnknown=false):Error {
  // Keep structured bridge errors, session-expiry handling and existing diagnostics intact.
  if(error instanceof Error&&/\[EO:[a-zA-Z0-9_.-]+\]/.test(error.message))return error;
  const name=error instanceof Error?error.name:"";
  let code="request_failed",message="The request could not be completed. Check the connection and server availability.";
  if(name==="TimeoutError"){code="network_timeout";message="The request timed out.";}
  else if(name==="AbortError"){code="operation_cancelled";message="The request was cancelled.";}
  else if(name==="SyntaxError"){code="json_decode_failed";message="The response is empty or is not valid JSON. Check the API response before submitting again.";}
  else if(name==="QuotaExceededError"){code="storage_full";message="Local browser storage is full. Preserve App data while freeing space.";}
  else if(name==="SecurityError"||name==="NotAllowedError"){code="access_denied";message="The browser or system denied access to this operation.";}
  else if(name!=="TypeError"){code="operation_failed";message="The operation failed before a valid result was received. Report this operation and diagnostic code.";}
  if(writeResultUnknown)message+=" The save result is unknown. Reconnect and refresh before submitting again; nothing retries automatically.";
  const failure=new RequestDiagnosticError(message,code,operation);
  if(name==="AbortError"||name==="TimeoutError")failure.name=name;
  return failure;
}

export async function diagnosticFetch(path:string,init:RequestInit={},request:typeof fetch=fetch):Promise<Response>{
  try{return await request(path,init);}
  catch(error){throw requestFailure(error,requestOperation(path,init.method),!['GET','HEAD'].includes((init.method??'GET').toUpperCase()));}
}
