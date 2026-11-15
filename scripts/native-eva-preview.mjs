// Disposable local UI fixture. No real accounts, Provider network or cloud requests.
import path from 'node:path';
import {createServer} from 'vite';
const server=await createServer({configFile:path.resolve('vite.trackers.config.ts'),server:{host:'127.0.0.1',port:4187,strictPort:true},plugins:[{
  name:'synthetic-native-eva',
  transformIndexHtml(html){return {html,tags:[{tag:'script',attrs:{src:'/@fs/'+path.resolve('scripts/native-eva-fixture.js').replaceAll('\\','/')},injectTo:'head-prepend'}]};},
  configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/eo-api/')){res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Synthetic preview blocks all cloud access'}));return;}next();});}
}]});
await server.listen();
console.log(JSON.stringify({pid:process.pid,port:4187,mock:true}));
async function close(){await server.close();process.exit(0);}
process.on('SIGTERM',close);process.on('SIGINT',close);
