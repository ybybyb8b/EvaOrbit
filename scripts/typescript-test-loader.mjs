export async function resolve(specifier,context,nextResolve){
  if(specifier==="server-only")return{url:"data:text/javascript,export%20%7B%7D",shortCircuit:true};
  if(specifier==="next/headers")return{url:"data:text/javascript,export%20async%20function%20cookies()%7Bthrow%20new%20Error('cookies%20unavailable%20in%20isolated%20tests')%7D%3Bexport%20async%20function%20headers()%7Bthrow%20new%20Error('headers%20unavailable%20in%20isolated%20tests')%7D",shortCircuit:true};
  try{return await nextResolve(specifier,context);}
  catch(error){
    if((specifier.startsWith("./")||specifier.startsWith("../"))&&!/\.[a-z0-9]+$/i.test(specifier)){
      try{return await nextResolve(`${specifier}.ts`,context);}catch{return nextResolve(`${specifier}/index.ts`,context);}
    }
    throw error;
  }
}
