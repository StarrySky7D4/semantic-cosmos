import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
const root=resolve(process.env.COSMOS_DIST||'dist');const port=Number(process.env.PORT||4173);
const basePath=process.env.COSMOS_BASEPATH||'/';
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css','.onnx':'application/octet-stream','.txt':'text/plain;charset=utf-8'};
createServer(async(req,res)=>{try{const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!requested.startsWith(basePath))throw Error('outside base');const pathname='/'+requested.slice(basePath.length);const path=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));if(path!==root&&!path.startsWith(root+sep))throw Error('outside root');const info=await stat(path);if(!info.isFile())throw Error('not file');res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(await readFile(path));}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+basePath));
