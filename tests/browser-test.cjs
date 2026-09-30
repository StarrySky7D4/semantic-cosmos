const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
(async()=>{
 const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:ROOT,env:{...process.env,PORT:'4193'},stdio:['ignore','pipe','inherit']});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject)});
 let browser;
 try{
 browser=await chromium.launch({...process.env.COSMOS_CHROMIUM?{executablePath:process.env.COSMOS_CHROMIUM}:{},args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1500,height:1000},deviceScaleFactor:1});const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto('http://127.0.0.1:4193/');await page.waitForFunction(()=>window.cosmosDebug?.graph);const initial=await page.evaluate(()=>{const g=cosmosDebug.graph;return{records:g.texts.length,roots:g.roots.length,topics:g.nodes.filter(n=>n.kind!=='text').length,wormholes:g.edges.filter(e=>e.type==='wormhole').length,runtime:g.metadata.runtime,names:g.roots.map(id=>g.map.get(id).label)}});assert.equal(initial.records,29);assert.equal(initial.runtime,'rust-wasm');
 assert.equal(await page.evaluate(()=>cosmosDebug.graph.metadata.layout),'topic-centres/compact-affinity-neighbourhoods');
 assert.ok(await page.evaluate(()=>cosmosDebug.graph.nodes.filter(n=>n.kind!=='text').every(n=>n.localRadius>=8&&Number.isFinite(n.localRadius))));
 await page.locator('#showTexts').uncheck();await page.locator('#depth').fill('1');await page.waitForTimeout(50);
 assert.ok(await page.evaluate(()=>cosmosDebug.drawnWorms.every(e=>e.lengthNormalized<=cosmosDebug.graph.parameters.max_worm_length+1e-8)));
 await page.locator('#showTexts').check();await page.locator('#depth').fill('3');
 const textDistance=()=>page.evaluate(()=>cosmosDebug.graph.nodes.filter(n=>n.kind==='text').reduce((s,n)=>s+n.distanceToTopic,0)/cosmosDebug.graph.texts.length);
 await page.locator('#density').fill('0');await page.locator('#rebuild').click();await page.waitForFunction(()=>cosmosDebug.graph.parameters.density===0);const looseDistance=await textDistance();
 await page.locator('#density').fill('1');await page.locator('#rebuild').click();await page.waitForFunction(()=>cosmosDebug.graph.parameters.density===1);assert.ok((await textDistance())<looseDistance*.6);
 await page.locator('#density').fill('0.8');await page.locator('#rebuild').click();await page.waitForFunction(()=>cosmosDebug.graph.parameters.density===.8);
 await page.locator('#relevanceFloor').fill('0.95');await page.locator('#rebuild').click();await page.waitForFunction(()=>cosmosDebug.graph.parameters.relevance_floor===.95);
 assert.ok(await page.evaluate(()=>cosmosDebug.graph.nodes.filter(n=>n.kind==='text').every(n=>n.placement==='outlier'&&n.distanceToTopic>225)));
 await page.locator('#relevanceFloor').fill('0.45');await page.locator('#wormLength').fill('0.1');await page.locator('#rebuild').click();await page.waitForFunction(()=>cosmosDebug.graph.parameters.max_worm_length===.1);
 assert.ok(await page.evaluate(()=>cosmosDebug.graph.edges.filter(e=>e.type==='wormhole').every(e=>e.lengthNormalized<=.1)));
 await page.locator('#wormLength').fill('0.65');await page.locator('#rebuild').click();await page.waitForFunction(()=>cosmosDebug.graph.parameters.max_worm_length===.65);await page.waitForTimeout(50);
 fs.mkdirSync(path.join(ROOT,'verification'),{recursive:true});await page.screenshot({path:path.join(ROOT,'verification/desktop.png'),fullPage:true});
 // Imported short text edges must not become long connections when collapsed.
 const geometry=await page.evaluate(()=>{const g=cosmosDebug.exportableUniverse(),e=g.edges.find(e=>e.type==='wormhole'),a=g.nodes.find(n=>n.id===e.source),b=g.nodes.find(n=>n.id===e.target);for(const n of g.nodes)if(n.kind!=='text')n.pos=n.root===a.root?[225,0,0]:[-225,0,0];a.pos=[0,0,0];b.pos=[67.5,0,0];return g;});
 await page.locator('#importBtn').click();await page.locator('#jsonPaste').fill(JSON.stringify(geometry));await page.locator('#doImport').click();await page.waitForFunction(()=>document.getElementById('importModal').hidden);
 assert.equal(await page.locator('#statWorm').innerText(),'1');await page.locator('#showTexts').uncheck();await page.locator('#depth').fill('1');await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>cosmosDebug.drawnWorms.length),0);
 await page.locator('#showTexts').check();await page.locator('#depth').fill('8');await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>cosmosDebug.drawnWorms.length),1);
 geometry.nodes.find(n=>n.id===geometry.edges.find(e=>e.type==='wormhole').target).pos=[500,0,0];
 await page.locator('#importBtn').click();await page.locator('#jsonPaste').fill(JSON.stringify(geometry));await page.locator('#doImport').click();await page.waitForFunction(()=>document.getElementById('importModal').hidden);assert.equal(await page.locator('#statWorm').innerText(),'0');assert.match(await page.locator('#workspaceStatus').innerText(),/移除.*过长/);
 await page.locator('#depth').fill('3');await page.locator('#importBtn').click();await page.locator('#demoBtn').click();await page.waitForFunction(()=>document.getElementById('importModal').hidden);
 await page.locator('#search').fill('DeepSeek');assert.ok(await page.locator('#tree button').count());await page.locator('#tree button').first().click();assert.match(await page.locator('#detailTitle').innerText(),/DeepSeek/);await page.locator('#search').fill('');
 await page.locator('#maxWorm').fill('0');await page.locator('#rebuild').click();await page.waitForFunction(()=>cosmosDebug.graph.parameters.max_wormholes===0);assert.equal(await page.locator('#statWorm').innerText(),'0');
 await page.locator('#saveWorkspace').click();await page.waitForFunction(()=>document.getElementById('workspaceStatus').textContent.includes('已保存'));await page.locator('#kRoots').fill('3');await page.locator('#rebuild').click();await page.waitForFunction(()=>cosmosDebug.graph.roots.length===3);await page.locator('#loadWorkspace').click();await page.waitForFunction(()=>cosmosDebug.graph.roots.length===4);
 const downloadP=page.waitForEvent('download');await page.locator('#exportBtn').click();const download=await downloadP;await download.saveAs(path.join(ROOT,'verification/universe.json'));const backup=JSON.parse(fs.readFileSync(path.join(ROOT,'verification/universe.json')));assert.equal(backup.texts.length,29);assert.ok(backup.texts[0].sources.length);assert.equal(backup.themes.length,6);
 await page.locator('#importBtn').click();await page.locator('#jsonFile').setInputFiles(path.join(ROOT,'verification/universe.json'));await page.locator('#doImport').click();await page.waitForFunction(()=>document.getElementById('importModal').hidden);assert.equal(await page.locator('#statTexts').innerText(),'29');
 await page.locator('#importBtn').click();await page.locator('#jsonPaste').fill('{"texts":["a","b"],"vectors":[[0,0],[1,0]]}');await page.locator('#doImport').click();assert.match(await page.locator('#importError').innerText(),/无效/);await page.locator('#closeImport').click();
 await page.locator('#importBtn').click();await page.locator('#demoBtn').click();await page.waitForFunction(()=>document.getElementById('importModal').hidden);
 // Run the real browser ONNX/WASM model, not the precomputed data path.
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.locator('#reembedBtn').click();await page.waitForFunction(()=>cosmosDebug.graph.metadata.source==='browser-model',{},{timeout:120000});assert.equal(await page.evaluate(()=>cosmosDebug.data.dimension),512);const comparison=await page.evaluate(()=>{let max=0;for(let i=0;i<COSMOS_DATA.vectors.length;i++){let score=0;for(let j=0;j<512;j++)score+=COSMOS_DATA.vectors[i][j]*cosmosDebug.data.vectors[i][j];max=Math.max(max,Math.abs(1-score));}return max});assert.ok(comparison<.02,'native/browser embedding consistency');
 // The second run must restore the completed embedding checkpoint.
 await page.locator('#reembedBtn').click();await page.waitForFunction(()=>!document.getElementById('reembedBtn').disabled);assert.equal(await page.locator('#statTexts').innerText(),'29');
 assert.ok(requests.filter(url=>/^https?:/.test(url)).every(url=>url.startsWith('http://127.0.0.1:4193/')),'all assets and model requests remain local');
 const cachedModel=await page.evaluate(async()=>{for(const key of await caches.keys()){if(key.startsWith('semantic-cosmos:')){const c=await caches.open(key);const requests=await c.keys();if(requests.some(r=>r.url.includes('model_quantized.onnx')))return true;}}return false;});assert.ok(cachedModel,'model cached for offline use');
 await page.context().setOffline(true);await page.reload();await page.waitForFunction(()=>window.cosmosDebug?.graph);assert.equal(await page.locator('#statTexts').innerText(),'29');await page.context().setOffline(false);
 await page.locator('#dateFilter').selectOption('window');await page.waitForFunction(()=>cosmosDebug.projected.filter(p=>p.n.kind==='text'&&cosmosDebug.graph.docs.get(p.n.documentId).inWindow===false).length===0);await page.locator('#dateFilter').selectOption('all');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(60);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(ROOT,'verification/mobile.png'),fullPage:true});await page.locator('#schemeTab').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(ROOT,'verification/scheme-mobile.png'),fullPage:true});
 // A single file still instantiates the real numerical WASM kernel offline.
 const offline=await browser.newPage({viewport:{width:1200,height:900}});offline.on('pageerror',e=>errors.push(e.message));await offline.goto('file://'+path.join(ROOT,'dist/news-cosmos.html'));await offline.waitForFunction(()=>window.cosmosDebug?.graph);assert.equal(await offline.locator('#statTexts').innerText(),'29');await offline.locator('#reembedBtn').click();await offline.waitForFunction(()=>document.getElementById('message').textContent.includes('HTTP'));await offline.locator('#kRoots').fill('3');await offline.locator('#rebuild').click();await offline.waitForFunction(()=>cosmosDebug.graph.roots.length===3);
 assert.deepEqual(errors,[]);const result={status:'PASS',initial,maxReferenceBrowserCosineDeviation:comparison,externalNetworkRequests:requests.filter(url=>/^https?:/.test(url)&&!url.startsWith('http://127.0.0.1:4193/')).length,checks:['independent topic centres and local balls','density control tightens neighbourhoods','outliers remain far from topics','worm length controls and collapsed drawing','imported long edges removed and short edges hidden when collapsed','real ONNX/WASM browser inference','Rust/WASM graph reconstruction','embedding checkpoint reuse','local snapshot save/restore','JSON graph roundtrip','invalid vectors rejected','news IDs and source links preserved','date filtering','mobile layouts','service-worker offline reload and model cache','offline HTML WASM reconstruction','no runtime errors']};fs.writeFileSync(path.join(ROOT,'verification/results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exit(1)});
