import type {BusinessRequest} from "./business-request";

// System integration requests have a separate account-bound transport. Credentials
// and reconciliation responses must never enter the ordinary offline API cache.
let active:{request:BusinessRequest}|undefined;
export function installNativeApiRequest(request:BusinessRequest){const session={request};active=session;return()=>{if(active===session)active=undefined;};}
export const nativeApiFetch:BusinessRequest=(path,init)=>active?active.request(path,init):fetch(path,init);
