import assert from 'node:assert/strict';
import {readFileSync,statSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(readFileSync('dist/data/build-manifest.json','utf8'));
const required=['dist/index.html','dist/news-cosmos.html','dist/.nojekyll','dist/sw.js','dist/assets/app.js','dist/assets/inference.worker.js','dist/vendor/ort-wasm-simd-threaded.jsep.mjs','dist/vendor/ort-wasm-simd-threaded.jsep.wasm','dist/licenses/bge-model-mit.txt','dist/licenses/onnxruntime-mit.txt','dist/licenses/transformers-apache-2.0.txt'];
for(const path of required)assert.ok(existsSync(path),'Missing Pages asset: '+path);
const wasm=readFileSync('dist/wasm/cosmos_core.wasm');
assert.ok(WebAssembly.validate(wasm),'Invalid numerical WASM');
assert.equal(hash(wasm),manifest.wasmSha256);
const model=JSON.parse(readFileSync('dist/data/model-manifest.json','utf8'));
for(const file of model.files){
 const path='dist/models/'+model.model+'/'+file.file,bytes=readFileSync(path);
 assert.equal(bytes.length,file.size,'Wrong model size: '+file.file);
 assert.equal(hash(bytes),file.sha256,'Wrong model hash: '+file.file);
 assert.ok(statSync(path).size<100*1024*1024,'Model exceeds normal Git file limit');
}
const html=readFileSync('dist/index.html','utf8');
assert.ok(html.includes('src="./assets/app.js"'),'Entry must support repository subpaths');
assert.ok(html.includes('window.COSMOS_DATA='),'Default data missing');
assert.ok(html.includes('window.COSMOS_WASM='),'Numerical WASM missing');
const app=readFileSync('dist/assets/app.js','utf8');
assert.ok(!app.includes('/workspace/scratch/'),'Build must not contain workspace paths');
console.log(JSON.stringify({status:'PASS',version:manifest.version,records:manifest.records,modelFiles:model.files.length,wasmBytes:wasm.length,subpathEntry:true}));
