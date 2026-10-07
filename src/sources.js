export const DEFAULT_DRIVE='https://drive.google.com/drive/folders/1Yk6sz2B9RmpSlf0dopd6YZsXZbb4Pcvo';
const LIMIT=40*1024*1024;
export function parseSource(kind,input){
 let u;try{u=new URL(input.trim())}catch{throw Error('请输入完整的 HTTPS 链接。')}
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('仅支持无内嵌凭据、使用标准端口的 HTTPS 链接。');
 let parts;try{parts=u.pathname.split('/').filter(Boolean).map(decodeURIComponent)}catch{throw Error('链接包含无效的 URL 编码，请重新复制来源链接。')}
 if(kind==='github'){
  if(u.hostname!=='github.com'||parts.length<2)throw Error('请输入 github.com 的仓库、目录或文件链接。');
  const [owner,repoName,mode,...tail]=parts,repo=repoName.replace(/\.git$/,'');
  if(!/^[\w.-]+$/.test(owner)||! /^[\w.-]+$/.test(repo)||mode&&!['tree','blob'].includes(mode))throw Error('GitHub 链接格式不支持。');
  if(mode&&(!tail.length||mode==='blob'&&tail.length<2))throw Error('目录或文件链接必须包含分支与路径；含斜杠的分支请用仓库链接并填写分支。');
  return {kind,owner,repo,mode,ref:tail[0]||'',path:tail.slice(1).join('/'),url:u.href};
 }
 if(kind!=='drive'||!['drive.google.com','docs.google.com'].includes(u.hostname))throw Error('请输入 Google Drive 文件或文件夹链接。');
 const folder=parts.indexOf('folders'),file=parts.indexOf('d'),id=folder>=0?parts[folder+1]:file>=0?parts[file+1]:u.searchParams.get('id');
 if(!id||! /^[\w-]+$/.test(id))throw Error('Drive 链接缺少有效文件或文件夹 ID。');
 return {kind,id,folder:folder>=0,url:u.href};
}
async function request(url,fetcher=fetch){
 let response;try{response=await fetcher(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(30000)})}catch(e){throw Error(e.name==='TimeoutError'?'连接超时，请稍后重试。':'浏览器无法读取来源：可能是跨域限制、网络错误或文件需要登录。请下载 JSON 后使用本地导入。')}
 if(!response.ok)throw Error(response.status===404?'来源不存在或没有公开读取权限（404）。':response.status===403||response.status===429?'读取被拒绝或 API 限流，请稍后重试；私有来源需要独立授权。':`来源返回 HTTP ${response.status}。`);
 if(Number(response.headers.get('content-length'))>LIMIT)throw Error('来源文件超过 40 MB。');
 const reader=response.body?.getReader();let text;
 if(reader){const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT){await reader.cancel();throw Error('来源文件超过 40 MB。')}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}text=new TextDecoder().decode(bytes)}else{text=await response.text();if(new TextEncoder().encode(text).length>LIMIT)throw Error('来源文件超过 40 MB。')}
 try{return JSON.parse(text)}catch{throw Error('来源未返回有效 JSON，可能返回了登录、下载确认页，或文件格式不支持。')}
}
export async function connectSource(source,{ref='',fetcher=fetch}={}){
 if(source.kind==='drive'){
  throw Error('不直接连接 Drive。请自行下载到本地并解压，再选择本地文件夹或多个 JSON；无需 Google 外部授权。');
 }
 const api=`https://api.github.com/repos/${source.owner}/${source.repo}`;
 const repo=await request(api,fetcher),branch=ref.trim()||source.ref||repo.default_branch;
 if(!branch)throw Error('仓库未提供默认分支。');
 const commit=await request(`${api}/commits/${encodeURIComponent(branch)}`,fetcher);
 if(!/^[a-f0-9]{40}$/.test(commit.sha))throw Error("GitHub 提交响应格式异常。");
 const tree=await request(`${api}/git/trees/${commit.sha}?recursive=1`,fetcher);
 if(tree.truncated)throw Error('仓库目录列表被 GitHub 截断，请改用较小仓库或本地导入。');
 if(!Array.isArray(tree.tree)||typeof tree.sha!=='string')throw Error('GitHub 目录响应格式异常。');
 const files=tree.tree.filter(x=>x.type==='blob'&&/\.json$/i.test(x.path)&&(source.mode==='blob'?x.path===source.path:!source.path||x.path.startsWith(source.path+'/'))).map(x=>({name:x.path,size:x.size,url:`https://raw.githubusercontent.com/${source.owner}/${source.repo}/${commit.sha}/${x.path.split('/').map(encodeURIComponent).join('/')}`}));
 if(!files.length)throw Error('该范围没有 JSON 文件。当前仅支持 JSON 数据集或导出的图谱。');
 if(files.length>2000)throw Error('JSON 文件超过 2000 个，请缩小来源范围。');
 return {files,label:`已连接公开仓库 ${source.owner}/${source.repo}；找到 ${files.length} 个 JSON。选择文件后验证内容。`};
}
export async function readSourceFile(file,fetcher=fetch){
 if(file.size>LIMIT)throw Error('来源文件超过 40 MB。');
 let raw=await request(file.url,fetcher);
 if(raw&&Array.isArray(raw.records)&&Array.isArray(raw.vectors))raw={...raw,texts:raw.records,meta:raw.sourceMeta||raw.meta||{}};
 if(!raw||typeof raw!=='object'||!(Array.isArray(raw)||Array.isArray(raw.items)||Array.isArray(raw.texts)||raw.schema==='semantic-cosmos/v1'&&Array.isArray(raw.nodes)))throw Error('此 JSON 不是支持的数据集：需要字符串/对象数组、items、texts 或 semantic-cosmos/v1 图谱。请选择其他文件。');
 const ingestionSource={url:file.url,file:file.name||null,readAt:new Date().toISOString()};
 if(Array.isArray(raw))return {texts:raw,meta:{ingestionSource}};
 if(raw.schema==='semantic-cosmos/v1')return {...raw,metadata:{...raw.metadata,sourceMeta:{...raw.metadata?.sourceMeta,ingestionSource}}};
 return {...raw,meta:{...raw.meta,ingestionSource}};
}
