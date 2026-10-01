import {WasmKernel} from './wasm.js';
import {nameThemes} from './labels.js';
import {construct,dot,unit} from './core.js';
import {DEFAULT_PARAMETERS,validateVectors} from './adapters.js';
self.onmessage=async event=>{let kernel;try{const {data,parameters,wasm}=event.data;
 if(!Array.isArray(data.records)||data.records.length<1||data.records.length>20000)throw Error('构建支持 1–20000 条记录');
 data.dimension=validateVectors(data.records,data.vectors);
 const p={...DEFAULT_PARAMETERS,...parameters};if(!parameters||!p||!Number.isInteger(p.k_roots)||p.k_roots<2||p.k_roots>8||!Number.isInteger(p.knn)||p.knn<0||p.knn>16||!Number.isInteger(p.max_wormholes)||p.max_wormholes<0||p.max_wormholes>4||!Number.isInteger(p.min_cluster_size)||p.min_cluster_size<2||p.min_cluster_size>16||![p.tau_in,p.tau_cross].every(x=>Number.isFinite(x)&&x>=0&&x<=1))throw Error('构建参数无效');
 if(!Number.isFinite(p.max_worm_length)||p.max_worm_length<.1||p.max_worm_length>1.5||!Number.isFinite(p.relevance_floor)||p.relevance_floor<0||p.relevance_floor>.95)throw Error('空间参数无效');
 if(!Number.isFinite(p.density)||p.density<0||p.density>1)throw Error('聚集强度无效');
 if(data.themeVectors?.length){validateVectors(data.themes,data.themeVectors);if(data.themeVectors[0].length!==data.dimension)throw Error('主题定义向量维度不匹配');}
 if(data.records.length<=400&&!p.scalable)kernel=await WasmKernel.create(wasm);data.vectors=data.vectors.map(v=>unit(v));const graph=construct(data,p,kernel);self.postMessage({type:'result',graph:graph.metadata.hierarchy?graph:nameThemes(graph,data)});
 }catch(error){self.postMessage({type:'error',message:error.message})}finally{kernel?.dispose();}};
