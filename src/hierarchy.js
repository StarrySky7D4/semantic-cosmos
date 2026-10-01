import {dot,unit,random} from './math.js';
import {fitTopics,SPACE_SCALE} from './space.js';

export const LEAF_CAPACITY=32;
export const BUILD_LIMIT=20000;
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
function axes(d,key){const rng=random(hash(key));return Array.from({length:3},()=>unit(Array.from({length:d},()=>rng()-.5)));}
const center=(members,V)=>{const sum=Array(V[0].length).fill(0);for(const i of members)for(let j=0;j<sum.length;j++)sum[j]+=V[i][j];return dot(sum,sum)<1e-20?V[members[0]].slice():unit(sum);};

// Fixed seeded semantic cells keep paths stable under reorder and append. Exact
// neighbours are only scanned inside capped cells; no corpus pair matrix exists.
export function constructHierarchy(data,p){
 const R=data.records,V=data.vectors.map(unit),nodes=[],edges=[],roots=[],byId=new Map();
 let comparisons=0,maxLocalPairs=0;
 const make=(id,kind,members,parent,depth,label,pos)=>{const n={id,kind,members:members.map(i=>R[i].id),memberIndices:members,children:[],parent:parent?.id||null,root:parent?.root||id,depth,label,pos,localRadius:kind==='text'?undefined:Math.max(8,80/Math.pow(2,depth)),cosmicLevel:kind==='text'?'行星':depth===0?'星云':depth===1?'星系':'恒星系'};nodes.push(n);byId.set(id,n);if(parent){parent.children.push(id);edges.push({source:parent.id,target:id,type:'tree'});}return n;};
 const split=(members,key,depth)=>{
  const A=axes(data.dimension,key),bins=new Map();
  for(const i of members){let cell=0;for(let a=0;a<3;a++){comparisons++;if(dot(V[i],A[a])>=0)cell|=1<<a;}if(!bins.has(cell))bins.set(cell,[]);bins.get(cell).push(i);}
  // Identical vectors cannot be semantically separated. Stable ID shards bound
  // work without pretending that their separation has semantic meaning.
  if(bins.size===1||depth>=5){bins.clear();for(const i of members){const cell=hash(key+'|'+R[i].id)%8;if(!bins.has(cell))bins.set(cell,[]);bins.get(cell).push(i);}if(bins.size===1){bins.clear();const ordered=members.slice().sort((a,b)=>R[a].id.localeCompare(R[b].id));ordered.forEach((i,j)=>{const cell=j%8;if(!bins.has(cell))bins.set(cell,[]);bins.get(cell).push(i);});}return {bins,identityShard:true};}
  return {bins,identityShard:false};
 };
 const grow=(members,parent,key,depth)=>{
  if(members.length<=LEAF_CAPACITY){const leaf=make(key+'/system','leaf',members,parent,depth,R[members[0]].topic||R[members[0]].category||'语义邻域',parent.pos.slice());leaf.partition='bounded-semantic-cell';const A=axes(data.dimension,key);
   for(const i of members){const rng=random(hash(R[i].id)),pos=parent.pos.map((x,a)=>x+(dot(V[i],A[a])*24+(rng()-.5)*8)/(depth+1));const n=make('doc:'+R[i].id,'text',[i],leaf,depth+1,R[i].title,pos);n.documentId=R[i].id;n.nearestTopic=leaf.id;n.placement='cluster';}
   maxLocalPairs=Math.max(maxLocalPairs,members.length*(members.length-1)/2);
   const seen=new Set();for(const i of members){const pairs=[];for(const j of members){if(i===j)continue;comparisons++;pairs.push({j,score:dot(V[i],V[j])});}pairs.sort((a,b)=>b.score-a.score||R[a.j].id.localeCompare(R[b.j].id));for(const t of pairs.slice(0,p.knn)){const key=[R[i].id,R[t.j].id].sort().join('|');if(seen.has(key))continue;seen.add(key);edges.push({source:'doc:'+R[i].id,target:'doc:'+R[t.j].id,type:'knn',score:t.score});}}
   return;
  }
  const partition=split(members,key,depth);const entries=[...partition.bins].sort((a,b)=>a[0]-b[0]);
  // Bounded sibling layout. ID fallback can produce many shards; use fixed
  // projection positions there rather than a quadratic fit.
  const C=entries.map(([,m])=>center(m,V)),A=axes(data.dimension,key),positions=C.map((v,j)=>partition.identityShard?[Math.cos(j*Math.PI/4)*60,Math.sin(j*Math.PI/4)*60,(j%2-.5)*40]:A.map(a=>dot(v,a)*SPACE_SCALE));
  entries.forEach(([cell,m],j)=>{const id=key+'/'+cell,n=make(id,'branch',m,parent,depth,(depth===1?'星系':'恒星系')+' · '+cell,parent.pos.map((x,a)=>x+positions[j][a]/Math.pow(2,depth)));n.partition=partition.identityShard?'identity-shard (identical/degenerate)':'seeded-semantic-cell';grow(m,n,id,depth+1);});
 };
 const A=axes(data.dimension,'semantic-cosmos/v2'),bins=new Map();const themes=data.themes||[],T=(data.themeVectors||[]).map(unit);
 for(let i=0;i<R.length;i++){let cell=0;if(T.length&&T.length===themes.length&&T.length<=32){let best=-Infinity;T.forEach((v,j)=>{comparisons++;const s=dot(V[i],v);if(s>best){best=s;cell=j;}});}else{for(let a=0;a<3;a++){comparisons++;if(dot(V[i],A[a])>=0)cell|=1<<a;}}if(!bins.has(cell))bins.set(cell,[]);bins.get(cell).push(i);}
 const entries=[...bins].sort((a,b)=>a[0]-b[0]),positions=fitTopics(entries.map(([,m])=>center(m,V)),undefined,p.density).positions;
 entries.forEach(([cell,m],j)=>{const id='nebula:'+cell,root=make(id,'root',m,null,0,T.length===themes.length&&T.length?themes[cell]?.title:'语义星云 '+cell,positions[j]);roots.push(id);grow(m,root,id,1);});
 return {schema:'semantic-cosmos/v1',roots,nodes,edges,texts:R,vectors:V,parameters:p,themes,themeVectors:T,metadata:{source:data.source,sourceMeta:data.sourceMeta||{},model:data.model,dimension:data.dimension,embedding:data.embedding||null,runtime:'bounded-hierarchy-js',layout:'semantic-cells/universe',warnings:[...(data.warnings||[]),'大库使用固定语义分区；近邻仅在最多 32 条的邻域内精确扫描，可能遗漏跨区关系。退化向量按稳定 ID 分片。'],hierarchy:{version:2,leafCapacity:LEAF_CAPACITY,comparisons,maxLocalPairs,globalPairMatrix:false},space:{scale:SPACE_SCALE},createdAt:new Date().toISOString()}};
}

// Traverse the frontier, never every hidden descendant. A focused path is
// prioritized so search results remain selectable even with a tight budget.
export function visibleFrontier(graph,{depth=2,texts=true,zoom=1,focus=null,budget=600,matches=()=>true}={}){
 const visible=new Set(),path=new Set();let n=graph.map.get(focus);while(n){path.add(n.id);n=graph.map.get(n.parent);}
 // Keep every matching nebula available in the overview even when the focused
 // tree consumes the remaining detail budget.
 for(const id of graph.roots){const root=graph.map.get(id);if(root&&matches(root)&&visible.size<budget)visible.add(id);}
 const queue=graph.roots.slice().sort((a,b)=>Number(path.has(b))-Number(path.has(a)));while(queue.length&&visible.size<budget){const id=queue.shift(),n=graph.map.get(id);if(!n||!matches(n))continue;visible.add(id);const expand=n.kind!=='text'&&(n.depth<depth||path.has(id));if(!expand)continue;
  const children=n.children.filter(id=>{const c=graph.map.get(id);return c&&matches(c)&&(c.kind!=='text'||texts&&(zoom>=.85||path.has(id)));}).sort((a,b)=>Number(path.has(b))-Number(path.has(a)));
  queue.unshift(...children);
 }
 return visible;
}
