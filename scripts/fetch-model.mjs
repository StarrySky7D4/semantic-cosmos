import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MODEL_ID,MODEL_REVISION } from '../src/adapters.js';
const base='public/models/'+MODEL_ID;
mkdirSync(base+'/onnx',{recursive:true});
const files=['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/model_quantized.onnx'];
const manifest={model:MODEL_ID,revision:MODEL_REVISION,files:[]};
for(const file of files){const target=base+'/'+file;const result=spawnSync('curl',['-L','--fail','--retry','2','--max-time','120','-o',target,'https://huggingface.co/'+MODEL_ID+'/resolve/'+MODEL_REVISION+'/'+file],{stdio:'inherit'});if(result.status!==0)throw Error('模型文件下载失败：'+file);const bytes=readFileSync(target);manifest.files.push({file,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
writeFileSync('public/data/model-manifest.json',JSON.stringify(manifest,null,2));
