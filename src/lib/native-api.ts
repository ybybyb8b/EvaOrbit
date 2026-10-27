import type {BusinessRequest} from "./business-request";
import {diagnosticFetch,requestFailure,requestOperation} from "./request-diagnostics.ts";

// System integration requests have a separate account-bound transport. Credentials
// and reconciliation responses must never enter the ordinary offline API cache.
let active:{request:BusinessRequest}|undefined;
export function installNativeApiRequest(request:BusinessRequest){const session={request};active=session;return()=>{if(active===session)active=undefined;};}
export const nativeApiFetch:BusinessRequest=async(path,init)=>{
  try{return await(active?active.request(path,init):diagnosticFetch(path,init));}
  catch(error){throw requestFailure(error,requestOperation(path,init?.method));}
};
