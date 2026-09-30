import { pipeline,env } from '@huggingface/transformers';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeTexts,embeddingText,MODEL_ID,MODEL_REVISION } from '../src/adapters.js';
env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=resolve('public/models')+'/';env.useFSCache=false;
env.backends.onnx.wasm.numThreads=1;
const rawBytes=readFileSync('public/data/news-source.json');const raw=JSON.parse(rawBytes);const normalized=normalizeTexts(raw);
const extractor=await pipeline('feature-extraction',MODEL_ID,{device:'cpu',dtype:'q8'});
const inputs=normalized.records.map(embeddingText).concat(normalized.themes.map(t=>t.title+'。'+t.summary)),rows=[];
const started=performance.now();for(let i=0;i<inputs.length;i+=4){const result=await extractor(inputs.slice(i,i+4),{pooling:'cls',normalize:true,truncation:true,max_length:512});rows.push(...result.tolist());console.log('嵌入 '+Math.min(i+4,inputs.length)+' / '+inputs.length);}
const vectors=rows.slice(0,normalized.records.length),themeVectors=rows.slice(normalized.records.length);
const embedding={model:MODEL_ID,revision:MODEL_REVISION,weightDtype:'q8',vectorDtype:'fp32',dimension:vectors[0].length,pooling:'cls',normalize:true,maxTokens:512,inputTemplate:'title + 。 + summary',sourceSha256:createHash('sha256').update(rawBytes).digest('hex'),generatedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-started)};
const dataset={...normalized,vectors,themeVectors,source:'user-news',model:MODEL_ID,embedding,dimension:embedding.dimension};
writeFileSync('public/data/news-vectors.json',JSON.stringify(dataset));
await extractor.dispose();console.log(JSON.stringify(embedding,null,2));
