import {normalizeTexts,validateVectors,MAX_RECORDS} from './adapters.js';

export const LOCAL_LIMITS={files:2000,bytes:40*1024*1024,records:MAX_RECORDS};
const textOf=value=>typeof value==='string'?value:Array.isArray(value)?value.map(textOf).filter(Boolean).join('\n'):value&&typeof value==='object'?Object.entries(value).map(([key,val])=>key+'：'+textOf(val)).join('\n'):value==null?'':String(value);
const sourcesOf=value=>(Array.isArray(value)?value:value?[value]:[]).filter(s=>s&&typeof s.url==='string').map(s=>({...s,title:String(s.title||s.name||s.url)}));
const contentRecord=r=>typeof r==='string'?r.trim():r&&typeof r==='object'&&['title','text','summary'].some(key=>typeof r[key]==='string'&&r[key].trim());
function articleDate(value){
 if(typeof value!=='string')return null;const match=/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/.exec(value);if(!match)return null;
 const date=new Date(match[1]+'T00:00:00Z');return Number.isFinite(+date)&&date.toISOString().slice(0,10)===match[1]?match[1]:null;
}
export function identifyDocument(raw){
 if(!raw||typeof raw!=='object')throw Error('JSON 必须是数据对象或文本数组。');
 if(!Array.isArray(raw)&&Array.isArray(raw.files)&&raw.files.every(f=>f&&typeof f.file==='string'))return 'manifest';
 if(raw.schema==='semantic-cosmos/v1'&&Array.isArray(raw.nodes)&&Array.isArray(raw.roots)&&Array.isArray(raw.texts))return 'graph';
 if(raw.metadata&&['overview_cards','deep_dive_analysis','briefing_flash'].some(k=>Array.isArray(raw[k])))return 'briefing';
 if(Array.isArray(raw))return 'array';
 if(Array.isArray(raw.items))return raw.meta?.saved_at?'timestamp-items':raw.meta?.part_count||raw.meta?.license_note&&raw.items.some(r=>r?.type&&r?.source)?'corpus-items':'items';
 if(Array.isArray(raw.texts))return 'texts';
 if(Array.isArray(raw.records))return 'records';
 throw Error('不支持的 JSON 结构。需要日报、清单、items、texts、records、文本数组或 semantic-cosmos/v1 图谱。');
}
export function adaptDocument(raw){
 const format=identifyDocument(raw);
 if(format==='manifest')return {format,raw,records:[],meta:raw,warnings:[]};
 if(format==='graph')return {format,raw,records:raw.texts,meta:raw.metadata?.sourceMeta||{},warnings:[]};
 let records,meta=raw.meta||raw.sourceMeta||{},warnings=[];
 if(format==='briefing'){
  meta={...meta,briefing_metadata:raw.metadata};records=[];
  for(const [section,key]of [['overview','overview_cards'],['analysis','deep_dive_analysis'],['flash','briefing_flash']]){
   if(raw[key]!==undefined&&!Array.isArray(raw[key]))throw Error(key+' 必须是数组。');
   for(const [index,item]of (raw[key]||[]).entries()){
    if(!item||typeof item!=='object')throw Error(key+' 第 '+(index+1)+' 条必须是对象。');
    const title=String(item.title??item.topic??item.headline??'').trim();
    if(!title)throw Error(key+' 第 '+(index+1)+' 条缺少标题/topic/headline。');
    const text=section==='analysis'?[textOf(item.evolution_and_updates),textOf(item.perspectives),textOf(item.long_term_impact)].filter(Boolean).join('\n\n'):String(item.summary??item.text??item.headline??title);
    records.push({...item,title,text,summary:text,category:String(item.category??item.field??section),sources:sourcesOf(item.sources??item.source),date:articleDate(item.event_date??item.date??item.published),published_date:item.published_date??articleDate(item.published),date_basis:item.event_date||item.date?'provided':articleDate(item.published)?'published':null,briefing_section:section,generated_at:raw.metadata.generated_at??null});
   }
  }
  warnings.push('日报 generated_at 仅保留为生成时间，不作为文章日期；未给出文章日期的记录保持未知。');
 }else{
  records=(Array.isArray(raw)?raw:raw.items||raw.texts||raw.records).map(record=>{
   if(typeof record==='string'||!record||typeof record!=='object')return record;
   const extraSources=[];if(typeof record.url==='string')extraSources.push({name:typeof record.source==='string'?record.source:'原文',url:record.url});if(typeof record.discussion_url==='string')extraSources.push({name:'讨论',url:record.discussion_url});
   const sources=sourcesOf(record.sources).concat(sourcesOf(extraSources)).filter((s,index,all)=>all.findIndex(other=>other.url===s.url)===index);
   const full=typeof record.full_content==='string'&&record.full_content.trim()?record.full_content:null;
   return {...record,...(full?{original_summary:record.summary??null,text:[record.summary||'',full].filter(Boolean).join('\n\n'),summary:[record.summary||'',full].filter(Boolean).join('\n\n')}:{}),sources,date:record.event_date??record.date??articleDate(record.published),published_date:record.published_date??articleDate(record.published),date_basis:record.date_basis??(record.event_date||record.date?'provided':articleDate(record.published)?'published':null)};
  });
 }
 if(!records.length)throw Error('数据集没有文章记录。清单不会作为文章导入。');
 if(records.length>MAX_RECORDS)throw Error('记录数超过 '+MAX_RECORDS+' 条。');
 for(const [index,r]of records.entries())if(!contentRecord(r))throw Error('第 '+(index+1)+' 条缺少有效 title/text/summary；当前未知结构不能猜测为文章。');
 for(const [index,r]of records.entries())if(r?.id!=null&&!['string','number'].includes(typeof r.id))throw Error('第 '+(index+1)+' 条 ID 必须是字符串或数字。');
 if(raw.vectors)validateVectors(records,raw.vectors);
 const declared=raw.meta?.item_count??raw.meta?.count;if(Number.isInteger(declared)&&declared!==records.length)warnings.push('元数据声明 '+declared+' 条，实际 '+records.length+' 条；不会按声明截断。');
 return {format,raw,records,meta,warnings};
}
// Relative paths only: never retain an absolute disk path. Folder name is excluded
// so selecting the same root from another disk does not change document IDs.
export function localPath(file){
 const relative=file.webkitRelativePath?file.webkitRelativePath.split('/').slice(1).join('/'):file.name;
 const path=String(relative||file.name).replace(/\\/g,'/');
 if(!path||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..')||/^[a-z]:/i.test(path))throw Error('本地相对路径无效。');
 return path;
}
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const embeddingConfig=value=>value?Object.fromEntries(Object.entries(value).filter(([key])=>!['inputSha256','generatedAt','durationMs','reusedRows','computedRows','uniqueInputs','gpuAdapter'].includes(key))):null;
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
function cancelled(signal){if(signal?.aborted)throw new DOMException('已取消本地预览；原有图谱未改变。','AbortError');}
export async function previewLocalFiles(files,{signal,onProgress=()=>{}}={}){
 cancelled(signal);const selected=Array.from(files).sort((a,b)=>{const x=a.webkitRelativePath||a.name,y=b.webkitRelativePath||b.name;return x<y?-1:x>y?1:0}),rows=[],warnings=[],fileMeta=[],dataFiles=[],byHash=new Map(),pathHashes=new Map();
 const totalBytes=selected.reduce((sum,f)=>sum+f.size,0),errors=[];
 if(selected.length>LOCAL_LIMITS.files)errors.push('最多选择 '+LOCAL_LIMITS.files+' 个文件，请减少选择。');
 if(totalBytes>LOCAL_LIMITS.bytes)errors.push('所选文件总大小超过 40 MiB，请取消勾选部分文件再预览。');
 if(!selected.length)errors.push('请先选择并勾选 JSON 文件。');
 if(errors.length)return {rows,errors,warnings,totalBytes,recordCount:0,raw:null};
 for(const [i,file]of selected.entries()){
  cancelled(signal);const row={path:'',bytes:file.size,count:0,format:'',status:'error'};rows.push(row);
  try{
   row.path=localPath(file);if(!/\.json$/i.test(row.path))throw Error('仅支持 JSON 文件。');
   onProgress('读取 '+(i+1)+' / '+selected.length+'：'+row.path);
   const text=await file.text();cancelled(signal);if(new TextEncoder().encode(text).length>LOCAL_LIMITS.bytes)throw Error('单文件超过 40 MiB。');
   let raw;try{raw=JSON.parse(text.replace(/^\uFEFF/,''))}catch{throw Error('JSON 语法错误，请修复或取消勾选此文件。')}
   const hash=await digest(canonical(raw));row.sha256=await digest(text);row.canonicalSha256=hash;cancelled(signal);
   if(pathHashes.has(row.path)&&pathHashes.get(row.path)!==hash)throw Error('同名相对路径对应不同文件内容，请分批导入或选择可区分的子目录。');pathHashes.set(row.path,hash);
   if(byHash.has(hash)){const previous=byHash.get(hash);row.status='duplicate';row.format=previous.format;row.duplicateOf=previous.path;previous.aliases.push(row.path);continue;}
   const adapted=adaptDocument(raw);Object.assign(row,{format:adapted.format,status:adapted.format==='manifest'?'manifest':'ready',count:adapted.records.length,aliases:[]});byHash.set(hash,row);
   warnings.push(...adapted.warnings.map(w=>row.path+'：'+w));fileMeta.push({path:row.path,sha256:row.sha256,canonicalSha256:hash,format:adapted.format,metadata:adapted.meta,aliases:row.aliases,...(adapted.raw.embedding?{embedding:adapted.raw.embedding}:{}),...(adapted.raw.themes?{themes:adapted.raw.themes}:{}),...(adapted.raw.themeVectors?{themeVectors:adapted.raw.themeVectors}:{})});
   if(adapted.format!=='manifest')dataFiles.push({row,adapted});
  }catch(e){if(e.name==='AbortError')throw e;row.error=e.message;errors.push((row.path||file.name)+'：'+e.message);}
 }
 cancelled(signal);
 for(const manifest of fileMeta.filter(f=>f.format==='manifest')){
  const dir=manifest.path.includes('/')?manifest.path.slice(0,manifest.path.lastIndexOf('/')+1):'';
  for(const entry of manifest.metadata.files){const row=rows.find(r=>r.path===dir+entry.file);if(!row)warnings.push(manifest.path+'：未选择清单文件 '+entry.file);else{if(row.status==='ready'&&Number.isInteger(entry.count)&&row.count!==entry.count)warnings.push(row.path+'：清单声明 '+entry.count+' 条，实际 '+row.count+' 条。');if(Number.isInteger(entry.bytes)&&row.bytes!==entry.bytes)warnings.push(row.path+'：清单字节数 '+entry.bytes+'，实际 '+row.bytes+'；以实际文件为准。');}}
 }
 if(!dataFiles.length)errors.push('所选文件没有可导入文章；manifest 仅作为清单保留。');
 if(dataFiles.some(f=>f.adapted.format==='graph')){
  if(dataFiles.length!==1)errors.push('已有图谱不能与其他数据集混合。请仅勾选一个图谱，或选择原文 JSON。');
  const graph=dataFiles[0].adapted.raw;
  if(dataFiles[0].adapted.records.length>MAX_RECORDS)errors.push('图谱超过 '+MAX_RECORDS+' 条文章，请单独使用现有图谱导入或减少数据。');
  return {rows,errors,warnings,totalBytes,recordCount:dataFiles[0].adapted.records.length,raw:errors.length?null:{...graph,metadata:{...graph.metadata,sourceMeta:{...graph.metadata?.sourceMeta,local_import:{files:fileMeta}}}}};
 }
 const records=[],vectors=[],identities=new Map();let duplicates=0,allVectors=true,vectorSignature=null;
 for(const {row,adapted}of dataFiles){
  const perFile=new Map(),seenIds=new Map();let uniqueCount=0;
  const signature=adapted.raw.vectors?canonical({model:adapted.raw.model??null,embedding:embeddingConfig(adapted.raw.embedding),dimension:adapted.raw.vectors[0]?.length}):null;
  if(!signature||vectorSignature!==null&&signature!==vectorSignature)allVectors=false;if(signature&&vectorSignature===null)vectorSignature=signature;
  for(const [index,input]of adapted.records.entries()){
   cancelled(signal);const record=typeof input==='string'?{text:input,title:input.slice(0,60)}:input,body=canonical(record);
   const originalId=record.id==null?null:String(record.id),key=(record.briefing_section?record.briefing_section+'/':'')+(originalId??'sha256-'+await digest(body)),id='local:'+encodeURIComponent(row.path)+':'+encodeURIComponent(key);
   if(originalId===''){errors.push(row.path+'：第 '+(index+1)+' 条 ID 为空。');continue;}
   if(seenIds.has(key)&&seenIds.get(key)!==body){errors.push(row.path+'：原 ID '+key+' 对应不同内容，无法安全合并。');continue;}seenIds.set(key,body);
   if(perFile.has(body)){
    const previous=perFile.get(body);if(adapted.raw.vectors&&canonical(previous.vector)!==canonical(adapted.raw.vectors[index])){errors.push(row.path+'：重复记录的向量不同，无法安全去重。');continue;}
    duplicates++;previous.record.import_provenance.indices.push(index);continue;
   }
   const next={...record,id,original_id:originalId,import_provenance:{file:row.path,file_sha256:row.sha256,original_id:originalId,indices:[index],format:adapted.format,file_aliases:row.aliases}};
   if(identities.has(id)){errors.push(row.path+'：重复文件路径/记录 ID 冲突，请重新选择唯一相对路径。');continue;}identities.set(id,true);
   records.push(next);if(adapted.raw.vectors)vectors.push(adapted.raw.vectors[index]);perFile.set(body,{record:next,vector:adapted.raw.vectors?.[index]});uniqueCount++;
   if(records.length>MAX_RECORDS){errors.push('合并后超过 '+MAX_RECORDS+' 条记录，请减少勾选文件。');break;}
   if(index%100===0){await new Promise(r=>setTimeout(r,0));cancelled(signal);}
  }
  row.uniqueCount=uniqueCount;
 }
 if(duplicates)warnings.push('同文件内去除 '+duplicates+' 条完全相同的重复记录；原始行号保留。');
 const duplicateFiles=rows.filter(r=>r.status==='duplicate').length;if(duplicateFiles)warnings.push('跳过 '+duplicateFiles+' 个内容完全相同的文件副本，并保留副本路径。');
 if(!allVectors&&dataFiles.some(f=>f.adapted.raw.vectors))warnings.push('所选文件混合原文/向量或向量模型不同，将使用现有浏览器模型重新嵌入全部原文。');
 if(!allVectors&&records.length>400)warnings.push('大批原文嵌入可能耗时较长；原文不截断，现有模型每条最多使用 512 tokens。可取消并复用已完成的本地行缓存。');
 const first=dataFiles[0]?.adapted.raw;
 if(allVectors&&records.length&&!first.model&&!first.embedding?.model)warnings.push('预计算向量未标注模型；已核对维度，请确认所选文件来自同一向量空间。');
 const raw={texts:records,meta:{local_import:{files:fileMeta,duplicateFiles,duplicateRecords:duplicates},item_count:records.length},...(allVectors&&records.length?{vectors,model:first.model,embedding:first.embedding?{...embeddingConfig(first.embedding),importedFromFiles:true}:null}:{} )};
 if(!errors.length)try{normalizeTexts(raw);if(raw.vectors)validateVectors(records,vectors)}catch(e){errors.push(e.message)}
 return {rows,errors,warnings,totalBytes,recordCount:records.length,duplicates,duplicateFiles,raw:errors.length?null:raw};
}
