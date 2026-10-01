import {applyThemeSpace,distance,SPACE_SCALE} from './space.js';
import {dot} from './math.js';
import {constructHierarchy} from './hierarchy.js';
export {dot,unit,add,scale,cross,clamp,random} from './math.js';
function majority(indices,records,key,fallback){const counts=new Map();indices.forEach(i=>{const s=records[i][key];if(s)counts.set(s,(counts.get(s)||0)+1)});return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||fallback}
function protectedGroups(tree,V,p){
 const groups=[];function cut(node){if(!node.children||node.score>=p.tau_in)groups.push(node.members.slice());else node.children.forEach(cut);}cut(tree);
 while(groups.length>1){const index=groups.findIndex(g=>g.length<p.min_cluster_size);if(index<0)break;const small=groups[index];let best=-Infinity,target=-1;for(let j=0;j<groups.length;j++){if(j===index)continue;let total=0;for(const a of small)for(const b of groups[j])total+=dot(V[a],V[b]);const mean=total/(small.length*groups[j].length);if(mean>best){best=mean;target=j;}}groups[target]=groups[target].concat(small);groups.splice(index,1);}
 return groups;
}
export function construct(data,p,kernel){
 p={relevance_floor:.45,max_worm_length:.65,density:.8,...p};
 if(data.records.length===1||data.records.length>400||p.scalable)return constructHierarchy(data,p);
 kernel.initialize(data.vectors);
 const {records:R,vectors:V}=data,k=Math.min(p.k_roots,R.length),bins=kernel.cluster(k),nodes=[],edges=[],roots=[],leafOf=Array(R.length);let serial=0;
 const make=(kind,label,members,parent,root,depth,pos,score)=>{let n={id:'n-'+serial++,kind,label,members:members.map(i=>R[i].id),memberIndices:members,children:[],parent,root,depth,pos,score:score??null};nodes.push(n);return n};
 bins.forEach((members,r)=>{
  const root=make('root',majority(members,R,'domain','根主题 '+(r+1)),members,null,null,0,[0,0,0],null);root.root=root.id;roots.push(root.id);
  const dendro=kernel.linkageGroups(protectedGroups(kernel.linkage(members),V,p));let leafCount=0,branchCount=0;
  function expand(c,parent,depth){
   const shouldSplit=!!c.children&&depth<7;
   const here=[0,0,0],kind=shouldSplit?'branch':'leaf';
   const label=kind==='leaf'?majority(c.members,R,'topic','叶主题 '+(r+1)+'.'+(++leafCount)):'分支 '+(r+1)+'.'+(++branchCount);
   const n=make(kind,label,c.members,parent.id,root.id,depth,here,c.score);parent.children.push(n.id);edges.push({source:parent.id,target:n.id,type:'tree'});
   if(shouldSplit)c.children.forEach((ch,j)=>expand(ch,n,depth+1));
   else{c.members.forEach(i=>{leafOf[i]=n.id;const t=make('text',R[i].title,[i],n.id,root.id,depth+1,[0,0,0],null);t.documentId=R[i].id;n.children.push(t.id);edges.push({source:n.id,target:t.id,type:'tree'})})}
  }
  if(dendro.children)dendro.children.forEach((c,j)=>expand(c,root,1));else expand(dendro,root,1);
 });
 const space=applyThemeSpace(nodes,V,data,p);
 const nodeMap=new Map(nodes.map(n=>[n.id,n]));
 const textNode=Array(R.length);nodes.filter(n=>n.kind==='text').forEach(n=>textNode[n.memberIndices[0]]=n.id);
 const knnSets=kernel.neighbors(p.knn),wormCandidates=[];
 // 跨根候选按叶主题对只留最强证据，避免重复边占满限额。
 const crossBest=new Map();
 for(const {i,j,score:s} of kernel.cross(p.tau_cross)){const length=distance(nodeMap.get(textNode[i]).pos,nodeMap.get(textNode[j]).pos)/SPACE_SCALE;if(length>p.max_worm_length+1e-9)continue;const key=[leafOf[i],leafOf[j]].sort().join('|');if(!crossBest.has(key)||crossBest.get(key).score<s)crossBest.set(key,{i,j,score:s,lengthNormalized:length});}
 const seen=new Set();knnSets.forEach((list,i)=>list.forEach(t=>{const key=[i,t.j].sort((a,b)=>a-b).join('|');if(!seen.has(key)){seen.add(key);edges.push({source:textNode[i],target:textNode[t.j],type:'knn',score:t.score})}}));
 wormCandidates.push(...crossBest.values());wormCandidates.sort((a,b)=>b.score-a.score);const degree=new Map();wormCandidates.forEach(t=>{const a=leafOf[t.i],b=leafOf[t.j];if((degree.get(a)||0)<p.max_wormholes&&(degree.get(b)||0)<p.max_wormholes){degree.set(a,(degree.get(a)||0)+1);degree.set(b,(degree.get(b)||0)+1);edges.push({source:textNode[t.i],target:textNode[t.j],type:'wormhole',score:t.score,lengthNormalized:t.lengthNormalized,leafSource:a,leafTarget:b})}});
 return {schema:'semantic-cosmos/v1',roots,nodes,edges,texts:R,parameters:p,metadata:{source:data.source,model:data.model,dimension:data.dimension,runtime:'rust-wasm',embedding:data.embedding||null,warnings:data.warnings||[],sourceMeta:data.sourceMeta||{},layout:'topic-centres/compact-affinity-neighbourhoods',space,relationSemantics:'cosine-candidate',createdAt:new Date().toISOString()},vectors:V,themes:data.themes||[],themeVectors:data.themeVectors||[]};
}
