import {previewLocalFiles,localPath,LOCAL_LIMITS} from './local-import.js';

export function setupLocalImport($,{onCancelImport=()=>{},validateGraph=()=>{}}={}){
 let selection=[],preview=null,controller=null,generation=0,ignored=0;
 const supportsDirectory='webkitdirectory' in $('folderFiles');
 $('folderFiles').hidden=!supportsDirectory;$('folderPickerLabel').hidden=!supportsDirectory;
 $('folderSupport').textContent=supportsDirectory?'目录选择包含子目录；多文件选择可作为后备。':'此浏览器不支持目录选择，请使用下方多文件选择；同名冲突文件请分批导入。';
 function invalidate(message='文件选择已变化，请重新预览。'){
  controller?.abort();controller=null;generation++;preview=null;$('previewLocal').disabled=false;$('localPreviewStatus').textContent=message;$('localPreviewDetails').replaceChildren();
  if($('sourceType').value==='folder')$('doImport').disabled=true;
 }
 function renderSelection(){
  $('localFileList').replaceChildren();
  for(const item of selection.slice(0,LOCAL_LIMITS.files)){
   const label=document.createElement('label'),box=document.createElement('input'),name=document.createElement('span');box.type='checkbox';box.checked=item.selected;
   let path;try{path=localPath(item.file)}catch{path=item.file.name}name.textContent=path+' · '+(item.file.size/1024).toFixed(1)+' KiB';
   box.onchange=()=>{onCancelImport();item.selected=box.checked;invalidate();};label.append(box,name);$('localFileList').append(label);
  }
 }
 async function runPreview(){
  invalidate('正在预览 JSON…');const current=generation;controller=new AbortController();const signal=controller.signal;$('previewLocal').disabled=true;
  try{
   const next=await previewLocalFiles(selection.filter(f=>f.selected).map(f=>f.file),{signal,onProgress:message=>{if(current===generation)$('localPreviewStatus').textContent=message;}});
   if(current!==generation||signal.aborted)return;preview=next;
   if(next.raw?.schema==='semantic-cosmos/v1')try{validateGraph(next.raw)}catch(e){next.errors.push('图谱验证失败：'+e.message);next.raw=null;}
   $('localPreviewStatus').textContent=`${selection.filter(f=>f.selected).length} 个 JSON · ${next.recordCount} 条记录${next.errors.length?'（有错误，尚不可导入）':''} · ${(next.totalBytes/1048576).toFixed(2)} MiB · 忽略 ${ignored} 个非 JSON 文件`+(next.raw?.vectors?' · 保留兼容预计算向量':next.raw?.schema?' · 已有图谱':' · 预计 512 维 FP32 向量 '+(next.recordCount*512*4/1048576).toFixed(2)+' MiB，原文将在浏览器嵌入');
   $('localPreviewDetails').replaceChildren();
   for(const row of next.rows){const p=document.createElement('p');p.textContent=row.path+'：'+(row.status==='duplicate'?'重复文件，已跳过（同 '+row.duplicateOf+'）':row.status==='manifest'?'manifest 清单，不作为文章':row.error||row.format+' · '+(row.uniqueCount??row.count)+' 条');$('localPreviewDetails').append(p);}
   for(const [kind,messages]of [['错误',next.errors],['提示',next.warnings]])for(const message of messages){const p=document.createElement('p');p.textContent=kind+'：'+message;if(kind==='错误')p.className='error';$('localPreviewDetails').append(p);}
   if($('sourceType').value==='folder')$('doImport').disabled=!next.raw;
  }catch(e){if(current===generation)$('localPreviewStatus').textContent=e.name==='AbortError'?'已取消预览，原有图谱未改变。':e.message;}
  finally{if(current===generation){controller=null;$('previewLocal').disabled=false;}}
 }
 function choose(files){
  onCancelImport();invalidate();const all=Array.from(files);ignored=all.filter(f=>!/\.json$/i.test(f.name)).length;
  selection=all.filter(f=>/\.json$/i.test(f.name)).map(file=>({file,selected:true}));renderSelection();
  if(selection.length>LOCAL_LIMITS.files){$('localPreviewStatus').textContent='JSON 超过 2000 个；不会截断导入。请重新选择较小目录或使用多文件选择。';return;}
  runPreview();
 }
 for(const id of ['folderFiles','multiFiles']){
  $(id).onchange=()=>choose($(id).files);
  $(id).addEventListener('cancel',()=>{$('localPreviewStatus').textContent='已取消文件选择，保留上次选择与预览。';});
 }
 $('previewLocal').onclick=runPreview;
 $('cancelLocal').onclick=()=>{onCancelImport();invalidate('已取消预览 / 导入，原有图谱未改变。');$('previewLocal').disabled=false;};
 return {
  sourceChanged(){controller?.abort();controller=null;generation++;$('previewLocal').disabled=false;if($('sourceType').value==='folder')$('doImport').disabled=!preview?.raw;},
  get raw(){if(!preview?.raw)throw Error('请先预览所选文件，并修复错误或取消勾选问题文件。');return preview.raw;},
  get preview(){return preview;},
 };
}
