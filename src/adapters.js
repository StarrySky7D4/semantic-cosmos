export const MODEL_ID='Xenova/bge-small-zh-v1.5';
export const MODEL_REVISION='75c43b069aac4d136ba6bc1122f995fedcfd2781';
export const DEFAULT_PARAMETERS={k_roots:4,tau_in:.72,tau_cross:.72,knn:4,max_wormholes:2,min_cluster_size:2,max_worm_length:.65,relevance_floor:.45,density:.8};

export function normalizeTexts(raw){
 const source=Array.isArray(raw)?raw:raw.items||raw.texts;
 if(!Array.isArray(source)||source.length<2||source.length>400)throw Error('文本构建支持 2–400 条记录');
 const ids=new Set(),warnings=[],meta=raw.meta||{};
 const records=source.map((record,index)=>{
  if(typeof record==='string')record={text:record,title:record.slice(0,60)};
  if(!record||typeof record!=='object')throw Error('第 '+(index+1)+' 条文本格式错误');
  const id=String(record.id??('doc-'+index));if(!id||ids.has(id))throw Error('文本 ID 缺失或重复：'+id);ids.add(id);
  const title=String(record.title??record.text??('文本 '+(index+1))),text=String(record.summary??record.text??record.title??'');
  if(!title.trim()&&!text.trim())throw Error('第 '+(index+1)+' 条文本为空');
  const date=typeof record.date==='string'?record.date:null;
  const inWindow=!!date&&meta.window_start&&meta.window_end?date>=meta.window_start&&date<=meta.window_end:null;
  const sources=Array.isArray(record.sources)?record.sources.filter(x=>x&&typeof x.url==='string').map(x=>({title:String(x.title||x.url),url:x.url})):[];
  return {id,title,text,date,category:String(record.category||'uncategorized'),entities:Array.isArray(record.entities)?record.entities.map(String):[],sources,inWindow};
 });
 if(Number.isInteger(meta.item_count)&&meta.item_count!==records.length)warnings.push('原始 meta.item_count='+meta.item_count+'，实际 '+records.length+' 条；保留全部记录。');
 const outside=records.filter(r=>r.inWindow===false).length;if(outside)warnings.push(outside+' 条记录早于或晚于标注窗口，作为背景保留。');
 const themes=Array.isArray(raw.themes)?raw.themes.filter(x=>x&&typeof x.title==='string').map(x=>({id:String(x.id||x.title),title:x.title,summary:String(x.summary||'')})):[];
 return {records,themes,sourceMeta:meta,warnings};
}
export function embeddingText(record){return record.title+'。'+record.text;}
export function validateVectors(records,vectors){
 if(!Array.isArray(vectors)||vectors.length!==records.length)throw Error('向量行数与文本条数不一致');
 const d=vectors[0]?.length;if(!Number.isInteger(d)||d<2||d>4096)throw Error('向量维度须在 2–4096 之间');
 vectors.forEach((v,i)=>{if(!Array.isArray(v)||v.length!==d||v.some(x=>typeof x!=='number'||!Number.isFinite(x))||v.every(x=>x===0))throw Error('向量第 '+(i+1)+' 行无效');});
 return d;
}
export function datasetFrom(raw,vectors=raw.vectors){const normalized=normalizeTexts(raw),dimension=validateVectors(normalized.records,vectors);return {...normalized,vectors,dimension,source:'import',model:raw.model||raw.embedding?.model||'用户向量',embedding:raw.embedding||null,themeVectors:raw.themeVectors||[]};}
