const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
(async()=>{
 const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:ROOT,env:{...process.env,PORT:'4194'},stdio:['ignore','pipe','inherit']});await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject)});let browser;
 try{browser=await chromium.launch({...process.env.COSMOS_CHROMIUM?{executablePath:process.env.COSMOS_CHROMIUM}:{},args:['--no-sandbox']});const page=await browser.newPage();await page.goto('http://127.0.0.1:4194/');await page.waitForFunction(()=>window.cosmosDebug?.graph);const start=Date.now();await page.locator('#reembedBtn').click();await page.waitForFunction(()=>cosmosDebug.graph.metadata.source==='browser-model',{},{timeout:120000});const data=await page.evaluate(()=>cosmosDebug.data);data.source='user-news';data.embedding.sourceSha256=createHash('sha256').update(readFileSync(path.join(ROOT,'public/data/news-source.json'))).digest('hex');data.embedding.durationMs=Date.now()-start;data.embedding.referenceRuntime='browser-onnx-wasm-single-thread';writeFileSync(path.join(ROOT,'public/data/news-vectors.json'),JSON.stringify(data));console.log(JSON.stringify({status:'generated',records:data.records.length,dimension:data.dimension,backend:data.embedding.backend,elapsedMs:data.embedding.durationMs},null,2));}finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exit(1)});
