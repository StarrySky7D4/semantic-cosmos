import {construct} from '../src/core.js';
import {DEFAULT_PARAMETERS,validateVectors} from '../src/adapters.js';
import {WasmKernel} from '../src/wasm.js';
import {nameThemes} from '../src/labels.js';
import {writeCatalog} from './catalog.mjs';
import {build} from 'esbuild';
import {inferenceBuild} from './browser-inference.mjs';
import {INFERENCE_RUNTIME} from '../src/inference-config.js';
import {readFileSync,writeFileSync,cpSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
rmSync('dist',{recursive:true,force:true});mkdirSync('dist/assets',{recursive:true});
cpSync('public','dist',{recursive:true});
// Git's Windows checkout may use CRLF in model JSON. Restore the exact upstream
// bytes described by the pinned manifest; never rewrite ONNX weights.
const pinnedModel=JSON.parse(readFileSync('public/data/model-manifest.json','utf8'));
for(const entry of pinnedModel.files){const path='dist/models/'+pinnedModel.model+'/'+entry.file;if(!entry.file.endsWith('.json'))continue;const bytes=Buffer.from(readFileSync(path,'utf8').replace(/\r\n/g,'\n'));if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Pinned model JSON hash mismatch: '+entry.file);writeFileSync(path,bytes);}
const common={bundle:true,target:'es2022',minify:true,platform:'browser',logLevel:'info'};
for(const pkg of ['onnxruntime-web','onnxruntime-common']){
 const installed=JSON.parse(readFileSync('node_modules/'+pkg+'/package.json','utf8')).version;
 if(INFERENCE_RUNTIME!=='onnxruntime-web/'+installed)throw Error('Inference runtime version mismatch: '+pkg+' '+installed);
}
const graphResult=await build({...common,entryPoints:['src/graph.worker.js'],format:'iife',write:false});const graphWorker=graphResult.outputFiles[0].text;
await build({...common,entryPoints:['src/app.js'],format:'esm',outfile:'dist/assets/app.js'});
await build({...common,...inferenceBuild,entryPoints:['src/inference.worker.js'],format:'esm',outfile:'dist/assets/inference.worker.js'});
mkdirSync('dist/vendor',{recursive:true});
for(const file of ['ort-wasm-simd-threaded.asyncify.mjs','ort-wasm-simd-threaded.asyncify.wasm'])cpSync('node_modules/onnxruntime-web/dist/'+file,'dist/vendor/'+file);
const data=JSON.parse(readFileSync(process.env.COSMOS_BASELINE_DATA||'public/data/news-halfyear-vectors.json','utf8')),wasm=readFileSync('public/wasm/cosmos_core.wasm');
validateVectors(data.records,data.vectors);if(!process.env.COSMOS_BASELINE_DATA){const source=JSON.parse(readFileSync('public/data/news-halfyear.json','utf8'));if(source.items.length!==data.records.length||source.items.some((r,i)=>r.id!==data.records[i].id||r.title!==data.records[i].title||r.summary!==data.records[i].text))throw Error('Source/vector IDs or embedding inputs differ; run npm run embed:halfyear.');}
const safeJSON=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const kernel=await WasmKernel.create(wasm);let graph;try{graph=construct(data,DEFAULT_PARAMETERS,kernel);if(!graph.metadata.hierarchy)graph=nameThemes(graph,data);}finally{kernel.dispose();}
const catalog=writeCatalog(graph,data);if(process.env.COSMOS_BASELINE_DATA)cpSync(process.env.COSMOS_BASELINE_DATA,'dist/data/news-halfyear-vectors.json');
writeFileSync('dist/assets/graph.worker.js',graphWorker);
const bootstrap='<script>window.COSMOS_DATA='+safeJSON(data)+';window.COSMOS_GRAPH='+safeJSON(graph)+';window.COSMOS_WASM='+safeJSON(wasm.toString('base64'))+';window.COSMOS_GRAPH_WORKER='+safeJSON(graphWorker)+';</script>';
const source=readFileSync('src/index.html','utf8');
writeFileSync('dist/index.html',source.replace('<script type="module" src="./assets/app.js"></script>','<script>window.COSMOS_CATALOG='+safeJSON(catalog)+';</script>\n<script type="module" src="./assets/app.js"></script>'));
const standalone=source.replace('<script type="module" src="./assets/app.js"></script>',bootstrap+'\n<script type="module">'+readFileSync('dist/assets/app.js','utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
writeFileSync('dist/news-cosmos.html',standalone);writeFileSync('dist/.nojekyll','');
const manifest={version:'0.5.0-local',inferenceRuntime:INFERENCE_RUNTIME,records:data.records.length,dimensions:data.dimension,model:data.model,revision:data.embedding.revision,wasmSha256:createHash('sha256').update(wasm).digest('hex'),wasmBytes:wasm.length,offlineViewer:'news-cosmos.html',embeddingRequiresHTTP:true,modelFiles:existsSync('public/data/model-manifest.json')?JSON.parse(readFileSync('public/data/model-manifest.json')):null};
writeFileSync('dist/data/build-manifest.json',JSON.stringify(manifest,null,2));
const cacheVersion=createHash('sha256').update(wasm).update(JSON.stringify(data)).update(graphWorker).update(standalone).update(readFileSync('dist/assets/inference.worker.js')).digest('hex').slice(0,12);
writeFileSync('dist/sw.js',`'use strict';
const PREFIX='semantic-cosmos:'+self.registration.scope+':';
const CACHE=PREFIX+'${cacheVersion}';
const SHELL=['./','./index.html','./assets/app.js','./assets/inference.worker.js'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(SHELL);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys()){if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);}await self.clients.claim();})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}catch(error){const hit=await cache.match(event.request);if(hit)return hit;throw error;}})());});
`);
console.log(JSON.stringify(manifest,null,2));
