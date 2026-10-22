export const sessionExpiredEvent="eo:local-session-expired";
export function notifySessionExpired(accountId:string){window.dispatchEvent(new CustomEvent(sessionExpiredEvent,{detail:{accountId}}));}
