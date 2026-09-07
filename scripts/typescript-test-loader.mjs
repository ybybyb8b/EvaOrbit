export async function resolve(specifier,context,nextResolve){
  if(specifier==="server-only")return{url:"data:text/javascript,export%20%7B%7D",shortCircuit:true};
  try{return await nextResolve(specifier,context);}
  catch(error){
    if((specifier.startsWith("./")||specifier.startsWith("../"))&&!/\.[a-z0-9]+$/i.test(specifier))return nextResolve(`${specifier}.ts`,context);
    throw error;
  }
}
