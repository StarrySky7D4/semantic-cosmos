import {validateVectors} from './adapters.js';
import {dot,unit} from './math.js';
export function nameThemes(graph,data){
 const labels=data.themes||[],themeVectors=data.themeVectors||[];
 const candidates=[];
 if(themeVectors.length===labels.length&&labels.length){
  validateVectors(labels,themeVectors);
  if(themeVectors[0].length!==data.dimension)throw Error('主题定义向量维度不匹配');
  for(const id of graph.roots){const root=graph.nodes.find(n=>n.id===id),center=Array(data.dimension).fill(0);root.memberIndices.forEach(i=>data.vectors[i].forEach((x,j)=>center[j]+=x));const normalized=unit(center);labels.forEach((t,j)=>candidates.push({root,theme:t,score:dot(normalized,unit(themeVectors[j]))}));}
  candidates.sort((a,b)=>b.score-a.score);const usedRoots=new Set(),usedThemes=new Set();for(const c of candidates){if(usedRoots.has(c.root.id)||usedThemes.has(c.theme.id))continue;c.root.label=c.theme.title;c.root.definition='主题名称由根中心与文件提供的主题定义匹配得到，未强制改变成员归属。\n\n原始组织线索（未核验事实）：'+c.theme.summary;c.root.themeMatch=c.score;usedRoots.add(c.root.id);usedThemes.add(c.theme.id);}
 }
 for(const n of graph.nodes){if(n.kind==='root'||n.kind==='text')continue;const center=Array(data.dimension).fill(0);n.memberIndices.forEach(i=>data.vectors[i].forEach((x,j)=>center[j]+=x));const normalized=unit(center);let best=-Infinity,index=n.memberIndices[0];for(const i of n.memberIndices){const s=dot(normalized,data.vectors[i]);if(s>best){best=s;index=i;}}const title=data.records[index].title;n.label=(n.kind==='branch'?'分支 · ':'')+(title.length>22?title.slice(0,21)+'…':title);n.representativeId=data.records[index].id;n.definition='名称摘自与本簇中心最接近的代表文本；这是可编辑的主题占位名。';}
 return graph;
}
