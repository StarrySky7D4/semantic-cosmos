import {WasmKernel} from './wasm.js';
import {construct,dot,unit} from './core.js';
import {DEFAULT_PARAMETERS,validateVectors} from './adapters.js';
function nameThemes(graph,data){
 const labels=data.themes||[],themeVectors=data.themeVectors||[];
 const candidates=[];
 if(themeVectors.length===labels.length&&labels.length){
  validateVectors(labels,themeVectors);
  if(themeVectors[0].length!==data.dimension)throw Error('主题定义向量维度不匹配');
  for(const id of graph.roots){const root=graph.nodes.find(n=>n.id===id),center=Array(data.dimension).fill(0);root.memberIndices.forEach(i=>data.vectors[i].forEach((x,j)=>center[j]+=x));const normalized=unit(center);labels.forEach((t,j)=>candidates.push({root,theme:t,score:dot(normalized,unit(themeVectors[j]))}));}
  candidates.sort((a,b)=>b.score-a.score);const usedRoots=new Set(),usedThemes=new Set();for(const c of candidates){if(usedRoots.has(c.root.id)||usedThemes.has(c.theme.id))continue;c.root.label=c.theme.title;c.root.definition='主题名称由根中心与文件提供的主题定义匹配得到，未强制改变成员归属。\n\n原始主题摘要：'+c.theme.summary;c.root.themeMatch=c.score;usedRoots.add(c.root.id);usedThemes.add(c.theme.id);}
 }
 for(const n of graph.nodes){if(n.kind==='root'||n.kind==='text')continue;const center=Array(data.dimension).fill(0);n.memberIndices.forEach(i=>data.vectors[i].forEach((x,j)=>center[j]+=x));const normalized=unit(center);let best=-Infinity,index=n.memberIndices[0];for(const i of n.memberIndices){const s=dot(normalized,data.vectors[i]);if(s>best){best=s;index=i;}}const title=data.records[index].title;n.label=(n.kind==='branch'?'分支 · ':'')+(title.length>22?title.slice(0,21)+'…':title);n.representativeId=data.records[index].id;n.definition='名称摘自与本簇中心最接近的代表文本；这是可编辑的主题占位名。';}
 return graph;
}
self.onmessage=async event=>{let kernel;try{const {data,parameters,wasm}=event.data;
 if(!Array.isArray(data.records)||data.records.length<2||data.records.length>400)throw Error('构建支持 2–400 条记录');
 data.dimension=validateVectors(data.records,data.vectors);
 const p={...DEFAULT_PARAMETERS,...parameters};if(!parameters||!p||!Number.isInteger(p.k_roots)||p.k_roots<2||p.k_roots>8||!Number.isInteger(p.knn)||p.knn<0||p.knn>16||!Number.isInteger(p.max_wormholes)||p.max_wormholes<0||p.max_wormholes>4||!Number.isInteger(p.min_cluster_size)||p.min_cluster_size<2||p.min_cluster_size>16||![p.tau_in,p.tau_cross].every(x=>Number.isFinite(x)&&x>=0&&x<=1))throw Error('构建参数无效');
 if(!Number.isFinite(p.max_worm_length)||p.max_worm_length<.1||p.max_worm_length>1.5||!Number.isFinite(p.relevance_floor)||p.relevance_floor<0||p.relevance_floor>.95)throw Error('空间参数无效');
 if(!Number.isFinite(p.density)||p.density<0||p.density>1)throw Error('聚集强度无效');
 if(data.themeVectors?.length){validateVectors(data.themes,data.themeVectors);if(data.themeVectors[0].length!==data.dimension)throw Error('主题定义向量维度不匹配');}
 kernel=await WasmKernel.create(wasm);data.vectors=data.vectors.map(v=>unit(v));const graph=nameThemes(construct(data,p,kernel),data);self.postMessage({type:'result',graph});
 }catch(error){self.postMessage({type:'error',message:error.message})}finally{kernel?.dispose();}};
