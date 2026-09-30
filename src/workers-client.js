const activeJobs=new Set();
function register(worker,url){const job={worker,url,reject:null};activeJobs.add(job);return job;}
function dispose(job){activeJobs.delete(job);job.worker.terminate();if(job.url)URL.revokeObjectURL(job.url);}
export function cancelJobs(){for(const job of [...activeJobs]){job.reject?.(Error('任务已取消，保留上一版结果。'));dispose(job);}}
export function computeGraph(data,parameters){
 const url=URL.createObjectURL(new Blob([window.COSMOS_GRAPH_WORKER],{type:'text/javascript'}));const job=register(new Worker(url),url);
 const bytes=Uint8Array.from(atob(window.COSMOS_WASM),c=>c.charCodeAt(0));
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>fail(Error('构建超时；请减少条数或分簇处理。')),45000);const finish=()=>{clearTimeout(timer);dispose(job)};const fail=e=>{finish();reject(e)};job.reject=fail;
  job.worker.onerror=e=>fail(Error(e.message||'计算 Worker 启动失败'));job.worker.onmessage=e=>{if(e.data.type==='result'){finish();resolve(e.data.graph)}else if(e.data.type==='error')fail(Error(e.data.message));};
  job.worker.postMessage({data,parameters,wasm:bytes.buffer},[bytes.buffer]);
 });
}
export function embedRecords(normalized,device,onProgress=()=>{}){
 if(location.protocol==='file:')return Promise.reject(Error('重新嵌入需要 HTTP 环境：在源码包目录运行 npm run serve，或部署 dist 到 GitHub Pages。当前文件仍可离线重建已保存的向量。'));
 const base=new URL('../',import.meta.url),worker=new Worker(new URL('./inference.worker.js',import.meta.url),{type:'module'}),job=register(worker,null);
 return new Promise((resolve,reject)=>{const fail=e=>{dispose(job);reject(e)};job.reject=fail;worker.onerror=e=>fail(Error(e.message||'模型 Worker 启动失败'));worker.onmessage=e=>{if(e.data.type==='progress')onProgress(e.data.message);else if(e.data.type==='result'){dispose(job);resolve(e.data.data)}else if(e.data.type==='error')fail(Error(e.data.message));};worker.postMessage({normalized,device,base:base.href});});
}
