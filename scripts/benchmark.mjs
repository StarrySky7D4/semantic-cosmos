import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {construct} from '../src/core.js';
import {WasmKernel} from '../src/wasm.js';
import {DEFAULT_PARAMETERS} from '../src/adapters.js';
import {unit,random} from '../src/math.js';
export function synthetic(n,d=64){const rnd=random(42);return {records:Array.from({length:n},(_,i)=>({id:'synthetic-'+i,title:'合成压力样本 '+i,text:'非真实新闻',category:'synthetic',sources:[]})),vectors:Array.from({length:n},(_,i)=>unit(Array.from({length:d},(_,j)=>(j===i%8?3:0)+rnd()-.5))),dimension:d,model:'synthetic-seeded-42',source:'synthetic',sourceMeta:{synthetic:true}};}
if(process.argv[1]?.endsWith('benchmark.mjs')){
 const kernel=await WasmKernel.create(readFileSync('public/wasm/cosmos_core.wasm')),rows=[];
 const mode=process.argv[2]||'baseline';
 for(const n of (mode==='baseline'?[29,100,200,400]:[29,100,200,400,1000,10000])){const data=n===29?JSON.parse(readFileSync('public/data/news-vectors.json')):synthetic(n);const times=[];let graph;
  for(let run=0;run<3;run++){const start=performance.now();graph=construct(data,{...DEFAULT_PARAMETERS,scalable:mode!=='baseline'},kernel);times.push(performance.now()-start);}
  rows.push({n,dimension:data.dimension,synthetic:n!==29,medianMs:times.slice().sort((a,b)=>a-b)[1],runsMs:times,nodes:graph.nodes.length,edges:graph.edges.length,algorithm:graph.metadata.runtime,hierarchy:graph.metadata.hierarchy||null});
 }
 kernel.dispose();mkdirSync('verification',{recursive:true});const result={mode,node:process.version,platform:process.platform,seed:42,runs:3,rows};writeFileSync('verification/'+mode+'-compute.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
