import {pipeline,env} from '@huggingface/transformers';
import {MODEL_ID,MODEL_REVISION,embeddingText} from './adapters.js';
import {readValue,storeValue} from './storage.js';
import {INFERENCE_RUNTIME,INFERENCE_SCHEMA,INFERENCE_BATCH_SIZE} from './inference-config.js';
const report=message=>self.postMessage({type:'progress',message});
self.onmessage=async event=>{let extractor;try{
 const {normalized,device,base}=event.data,started=performance.now();
 env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=new URL('models/',base).href;
 env.backends.onnx.wasm.wasmPaths={mjs:new URL('vendor/ort-wasm-simd-threaded.asyncify.mjs',base).href,wasm:new URL('vendor/ort-wasm-simd-threaded.asyncify.wasm',base).href};env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
 if(device==='webgpu'&&!navigator.gpu)throw Error('此浏览器没有可用 WebGPU；请选择 WASM / CPU。');
 let gpuAdapter=null;if(device==='webgpu'){const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance',forceFallbackAdapter:false});if(!adapter)throw Error('WebGPU adapter unavailable');const info=adapter.info;if(info?.isFallbackAdapter)throw Error('WebGPU hardware adapter unavailable (software adapter)');gpuAdapter={vendor:info?.vendor||'',architecture:info?.architecture||'',isFallbackAdapter:info?.isFallbackAdapter??null};env.backends.onnx.webgpu.adapter=adapter;}
 const records=normalized.records,themes=normalized.themes||[],inputs=records.map(embeddingText).concat(themes.map(t=>t.title+'。'+t.summary));
 const identity=JSON.stringify({inputs,model:MODEL_ID,revision:MODEL_REVISION,device,pooling:'cls',dtype:'q8',maxTokens:512,runtime:INFERENCE_RUNTIME,schema:INFERENCE_SCHEMA,batchSize:INFERENCE_BATCH_SIZE});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));const key=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 let checkpoint;try{checkpoint=await readValue('checkpoints',key)}catch{}
 const valid=r=>Array.isArray(r)&&r.length===512&&r.every(Number.isFinite)&&r.some(x=>x!==0),rows=Array(inputs.length),unique=new Map(),config={model:MODEL_ID,revision:MODEL_REVISION,device,pooling:'cls',dtype:'q8',maxTokens:512,runtime:INFERENCE_RUNTIME,schema:INFERENCE_SCHEMA,batchSize:INFERENCE_BATCH_SIZE};let reusedRows=0,computedRows=0;
 for(let i=0;i<inputs.length;i++){const text=inputs[i];if(!unique.has(text)){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({...config,text}))),rowKey='row:'+Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');let cached;try{cached=await readValue('checkpoints',rowKey)}catch{}unique.set(text,{key:rowKey,text,row:valid(cached?.row)?cached.row:valid(checkpoint?.rows?.[i])?checkpoint.rows[i]:null,indices:[]});}const entry=unique.get(text);entry.indices.push(i);if(entry.row)reusedRows++;}
 const pending=[...unique.values()].filter(x=>!x.row);report('复用嵌入 '+reusedRows+' / '+inputs.length+' · '+pending.length+' 个新文本');
 if(pending.length){extractor=await pipeline('feature-extraction',MODEL_ID,{device:device==='webgpu'?'webgpu':'wasm',dtype:'q8',progress_callback:info=>{if(info.status==='progress')report('模型加载 '+(info.progress||0).toFixed(0)+'%');}});
  for(let i=0;i<pending.length;i+=INFERENCE_BATCH_SIZE){const output=await extractor(pending.slice(i,i+INFERENCE_BATCH_SIZE).map(x=>x.text),{pooling:'cls',normalize:true,truncation:true,max_length:512}),result=output.tolist();for(let j=0;j<result.length;j++){const entry=pending[i+j];entry.row=result[j];computedRows++;try{await storeValue('checkpoints',entry.key,{row:entry.row,updatedAt:Date.now()})}catch{}}report('新嵌入 '+computedRows+' / '+pending.length+' · 分条检查点已保存');}
 }
 for(const entry of unique.values())for(const i of entry.indices)rows[i]=entry.row;
 const embedding={runtime:INFERENCE_RUNTIME,inferenceSchema:INFERENCE_SCHEMA,batchSize:INFERENCE_BATCH_SIZE,gpuAdapter,model:MODEL_ID,revision:MODEL_REVISION,weightDtype:'q8',vectorDtype:'fp32',pooling:'cls',dimension:512,normalize:true,maxTokens:512,inputTemplate:'title + 。 + summary',inputSha256:key,backend:device,generatedAt:new Date().toISOString(),durationMs:performance.now()-started,reusedRows,computedRows,uniqueInputs:unique.size};
 self.postMessage({type:'result',data:{...normalized,vectors:rows.slice(0,records.length),themeVectors:rows.slice(records.length),dimension:512,source:'browser-model',model:MODEL_ID,embedding}});
 }catch(error){self.postMessage({type:'error',message:'本地模型运行失败：'+error.message})}finally{await extractor?.dispose();}};
