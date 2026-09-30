import {pipeline,env} from '@huggingface/transformers';
import {MODEL_ID,MODEL_REVISION,embeddingText} from './adapters.js';
import {readValue,storeValue} from './storage.js';
const report=message=>self.postMessage({type:'progress',message});
self.onmessage=async event=>{let extractor;try{
 const {normalized,device,base}=event.data;
 env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=new URL('models/',base).href;
 env.backends.onnx.wasm.wasmPaths=new URL('vendor/',base).href;env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
 if(device==='webgpu'&&!navigator.gpu)throw Error('此浏览器没有可用 WebGPU；请选择 WASM / CPU。');
 const records=normalized.records,themes=normalized.themes||[],inputs=records.map(embeddingText).concat(themes.map(t=>t.title+'。'+t.summary));
 const identity=JSON.stringify({inputs,model:MODEL_ID,revision:MODEL_REVISION,device,pooling:'cls',dtype:'q8',maxTokens:512});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));const key=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 let checkpoint;try{checkpoint=await readValue('checkpoints',key)}catch{}
 let rows=checkpoint?.rows||[];if(!Array.isArray(rows)||rows.length>inputs.length||rows.some(r=>!Array.isArray(r)||r.length!==512||r.some(x=>!Number.isFinite(x))))rows=[];
 report(rows.length?'恢复已完成嵌入 '+rows.length+' / '+inputs.length:'加载中文嵌入模型（约 24 MB）…');
 if(rows.length<inputs.length){extractor=await pipeline('feature-extraction',MODEL_ID,{device:device==='webgpu'?'webgpu':'wasm',dtype:'q8',progress_callback:info=>{if(info.status==='progress')report('模型加载 '+(info.progress||0).toFixed(0)+'%');}});
  for(let i=rows.length;i<inputs.length;i+=4){const output=await extractor(inputs.slice(i,i+4),{pooling:'cls',normalize:true,truncation:true,max_length:512});rows.push(...output.tolist());try{await storeValue('checkpoints',key,{rows,updatedAt:Date.now()})}catch{}report('嵌入 '+rows.length+' / '+inputs.length+' · 已完成部分可恢复');}
 }
 const embedding={model:MODEL_ID,revision:MODEL_REVISION,weightDtype:'q8',vectorDtype:'fp32',pooling:'cls',dimension:512,normalize:true,maxTokens:512,inputTemplate:'title + 。 + summary',inputSha256:key,backend:device,generatedAt:new Date().toISOString()};
 self.postMessage({type:'result',data:{...normalized,vectors:rows.slice(0,records.length),themeVectors:rows.slice(records.length),dimension:512,source:'browser-model',model:MODEL_ID,embedding}});
 }catch(error){self.postMessage({type:'error',message:'本地模型运行失败：'+error.message})}finally{await extractor?.dispose();}};
