import {dot,unit,scale,clamp,random} from './math.js';

export const SPACE_SCALE=225;
export const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const safeUnit=a=>Math.hypot(...a)>1e-10?unit(a):[1,0,0];
export const topicTarget=(similarity,density=.8)=>SPACE_SCALE*(.075+Math.sqrt(Math.max(0,2-2*clamp(similarity,-1,1))))*(1-.4*density);

// Free 3D centres: similarity-dependent spring rest lengths provide soft
// exclusion. There is no common sphere and no fixed radial constraint.
export function fitTopics(vectors,kinds=vectors.map(()=> 'root'),density=.8){
 const n=vectors.length,targets=[],weights=Array(n).fill(0);
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  const weight=kinds[i]==='root'&&kinds[j]==='root'?4:kinds[i]==='root'||kinds[j]==='root'?2:1;
  targets.push([i,j,topicTarget(dot(vectors[i],vectors[j]),density)/SPACE_SCALE,weight]);weights[i]+=weight;weights[j]+=weight;
 }
 let best,bestLoss=Infinity;
 const iterations=Math.max(50,Math.min(420,Math.floor(1800000/Math.max(1,targets.length))));
 for(let attempt=0;attempt<3;attempt++){
  const rng=random(1709+attempt*803),positions=Array.from({length:n},()=>Array.from({length:3},()=>rng()-.5));
  for(let step=0;step<iterations;step++){
   const gradients=Array.from({length:n},()=>[0,0,0]);
   for(const [i,j,target,w]of targets){const delta=positions[i].map((x,a)=>x-positions[j][a]),d=Math.hypot(...delta),factor=w*(d-target)/Math.max(d,1e-8);for(let a=0;a<3;a++){gradients[i][a]+=factor*delta[a];gradients[j][a]-=factor*delta[a];}}
   const rate=.8*(1-.65*step/iterations);
   for(let i=0;i<n;i++)positions[i]=positions[i].map((x,a)=>x-rate*gradients[i][a]/Math.max(1,weights[i]));
  }
  const loss=targets.reduce((sum,[i,j,t,w])=>sum+w*(distance(positions[i],positions[j])-t)**2,0);
  if(loss<bestLoss){bestLoss=loss;best=positions;}
 }
 const mean=[0,1,2].map(axis=>best.reduce((sum,p)=>sum+p[axis],0)/Math.max(1,n));
 const totalWeight=targets.reduce((s,t)=>s+t[3],0);
 return {positions:best.map(p=>p.map((x,i)=>(x-mean[i])*SPACE_SCALE)),rms:Math.sqrt(bestLoss/Math.max(1,totalWeight))};
}

// Shared global projection of semantic residuals gives each document a small
// meaningful local displacement, rather than independent random jitter.
function residualAxes(V){
 const d=V[0].length,mean=Array(d).fill(0);for(const v of V)for(let j=0;j<d;j++)mean[j]+=v[j]/V.length;
 const rows=V.filter((_,i)=>i%Math.max(1,Math.floor(V.length/32))===0).slice(0,40).map(v=>v.map((x,j)=>x-mean[j]));
 const rng=random(8849),axes=[];
 for(let a=0;a<3;a++){
  let axis=unit(Array.from({length:d},()=>rng()-.5));
  for(let step=0;step<20;step++){
   const next=Array(d).fill(0);for(const row of rows){const s=dot(row,axis);for(let j=0;j<d;j++)next[j]+=s*row[j];}
   for(const old of axes){const s=dot(next,old);for(let j=0;j<d;j++)next[j]-=s*old[j];}
   const norm=Math.hypot(...next);if(norm<1e-10){axis=Array(d).fill(0);break;}axis=next.map(x=>x/norm);
  }
  axes.push(axis);
 }
 return axes;
}

export function locateText(vector,anchors,{floor=.45,density=.8,scopeVectors=[],axes=[],allTopics=anchors,seed=1}={}){
 const similarities=anchors.map(a=>clamp(dot(vector,a.vector),-1,1));
 const ranked=similarities.map((score,i)=>({i,score})).sort((a,b)=>b.score-a.score||a.i-b.i),best=ranked[0].score;
 const scopeSimilarity=scopeVectors.length?Math.max(...scopeVectors.map(v=>dot(vector,v))):null;
 const active=ranked.filter(t=>t.score>floor).slice(0,3),top=anchors[ranked[0].i];
 let pos,placement;
 if(!active.length||(scopeSimilarity!==null&&scopeSimilarity<floor)){
  const rng=random(seed+451),direction=safeUnit([rng()-.5,rng()-.5,rng()-.5]);
  const extent=Math.max(0,...allTopics.map(t=>Math.hypot(...t.pos)+(t.radius||0)));
  pos=scale(direction,extent+SPACE_SCALE*(1.2+Math.max(0,floor-(scopeSimilarity??best))));placement='outlier';
 }else{
  const weights=active.map(t=>Math.max(0,(t.score-floor)/(1-floor))**2*Math.exp((t.score-best)/.07)),total=weights.reduce((s,w)=>s+w,0);
  const barycentre=[0,1,2].map(axis=>active.reduce((sum,t,j)=>sum+weights[j]*anchors[t.i].pos[axis],0)/total);
  const dominance=weights.length===1?1:1-weights[1]/weights[0],pull=density*dominance;
  pos=barycentre.map((x,i)=>(1-pull)*x+pull*top.pos[i]);
  const residual=vector.map((x,i)=>x-top.vector[i]),raw=axes.length?axes.map(a=>dot(residual,a)):[0,0,0],length=Math.hypot(...raw);
  const magnitude=Math.min(top.radius||24,length*SPACE_SCALE*.7*(1-.65*density))*dominance;
  if(length>1e-10)pos=pos.map((x,i)=>x+raw[i]/length*magnitude);
  placement=dominance<.35?'bridge':'cluster';
 }
 return {pos,placement,nearestTopic:top.id,distanceToTopic:distance(pos,top.pos),maxTopicSimilarity:best,scopeSimilarity,topicSimilarities:anchors.map((a,i)=>({id:a.id,score:similarities[i]}))};
}

export function applyThemeSpace(nodes,V,data,p){
 const topics=nodes.filter(n=>n.kind!=='text'),vectors=topics.map(n=>{
  const center=Array(V[0].length).fill(0);for(const i of n.memberIndices)for(let j=0;j<center.length;j++)center[j]+=V[i][j];
  return Math.hypot(...center)>1e-10?unit(center):V[n.memberIndices[0]].slice();
 });
 const fit=fitTopics(vectors,topics.map(n=>n.kind),p.density);
 const allTopics=topics.map((n,i)=>{
  n.pos=fit.positions[i];const cohesion=n.memberIndices.reduce((sum,j)=>sum+dot(V[j],vectors[i]),0)/n.memberIndices.length;
  const nearest=Math.min(Infinity,...fit.positions.filter((_,j)=>i!==j).map(p=>distance(p,n.pos)));
  n.localRadius=Math.max(8,Math.min(SPACE_SCALE*(.12+.3*Math.sqrt(Math.max(0,2-2*cohesion)))*(1-.5*p.density),Math.max(8,nearest*.65)));
  return {id:n.id,pos:n.pos,vector:vectors[i],radius:n.localRadius,kind:n.kind};
 });
 // Leaf references avoid counting the same broad theme repeatedly at every
 // hierarchy depth, while all topic centres still participate in the fit.
 const anchors=allTopics.filter(t=>t.kind==='leaf'),scopeVectors=(data.themeVectors||[]).map(unit),axes=residualAxes(V);
 nodes.filter(n=>n.kind==='text').forEach(n=>Object.assign(n,locateText(V[n.memberIndices[0]],anchors,{floor:p.relevance_floor,density:p.density,scopeVectors,axes,allTopics,seed:n.memberIndices[0]+1})));
 return {scale:SPACE_SCALE,fitRmsNormalized:fit.rms,topicMetric:'cosine-dependent-soft-exclusion',textReferences:'leaf-centroids',scopeGate:scopeVectors.length?'provided-theme-definitions':'leaf-centroids',density:p.density,relevanceFloor:p.relevance_floor,maxWormLength:p.max_worm_length};
}

export function shortWorm(a,b,limit=.65,scale=SPACE_SCALE){return distance(a,b)<=limit*scale+1e-6;}
