import {captureNativeSessionGuard} from "./native-bridge.ts";
import {eventKitSafetyFailure} from "./eventkit-sync.ts";
export async function runNativeForegroundTasks(tasks:Array<{name:string;run:()=>Promise<unknown>}>){
 const guardSession=captureNativeSessionGuard(),errors:string[]=[];
 for(const task of tasks){guardSession();try{await task.run();guardSession();}catch(error){guardSession();if(eventKitSafetyFailure(error))throw error;errors.push(`${task.name}：${error instanceof Error?error.message:"Operation failed"}`);}}
 if(errors.length)throw new Error(errors.join("；"));
}
