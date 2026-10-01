import {buildPresentation,compactPresentation} from '../src/presentation.js';
import {writeFileSync,mkdirSync} from 'node:fs';
export function writeCatalog(graph,data,out='dist'){
 mkdirSync(out+'/data/chunks',{recursive:true});const topics=graph.nodes.filter(n=>n.kind!=='text'),textNodes=graph.nodes.filter(n=>n.kind==='text'),index=[],chunks=[],nodeMap=new Map(graph.nodes.map(n=>[n.id,n])),docMap=new Map(graph.texts.map(t=>[t.id,t])),edgeMap=new Map();for(const e of graph.edges){const owner=nodeMap.get(e.source)?.kind==='text'?e.source:nodeMap.get(e.target)?.kind==='text'?e.target:null;if(owner){if(!edgeMap.has(owner))edgeMap.set(owner,[]);edgeMap.get(owner).push(e);}}
 for(let start=0;start<textNodes.length;start+=32){const nodes=textNodes.slice(start,start+32),texts=nodes.map(n=>docMap.get(n.documentId)),chunk='records-'+chunks.length;
  const edges=nodes.flatMap(n=>edgeMap.get(n.id)||[]);
  // Each edge belongs to exactly one shard, including cross-shard edges.
  const owned=edges;
  writeFileSync(out+'/data/chunks/'+chunk+'.json',JSON.stringify({nodes,texts,edges:owned}));chunks.push(chunk);
  for(const n of nodes){const r=docMap.get(n.documentId),record=Object.fromEntries(['id','title','text','date','event_date','published_date','category','topic','vendor','model_name','evidence_category','verification_status','inWindow'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));index.push({record,nodeId:n.id,parent:n.parent,chunk});}
 }
 const order=new Map(graph.texts.map((r,i)=>[r.id,i]));index.sort((a,b)=>order.get(a.record.id)-order.get(b.record.id));
 const manifest={schema:'semantic-cosmos/catalog-v1',vectors:'data/news-halfyear-vectors.json',chunks,index,graph:{schema:graph.schema,metadata:{...graph.metadata,edgeCounts:{knn:graph.edges.filter(e=>e.type==='knn').length,wormhole:graph.edges.filter(e=>e.type==='wormhole').length}},parameters:graph.parameters,roots:graph.roots,nodes:topics,edges:graph.edges.filter(e=>nodeMap.get(e.source)?.kind!=='text'&&nodeMap.get(e.target)?.kind!=='text'),themes:data.themes,themeVectors:[]}};
 const presentation=buildPresentation(graph);mkdirSync(out+'/data/scenes',{recursive:true});for(const [id,scene]of Object.entries(presentation.scenes))writeFileSync(out+'/data/scenes/'+presentation.scopes[id].chunk+'.json',JSON.stringify(scene));manifest.presentation=compactPresentation(presentation);
 writeFileSync(out+'/data/catalog.json',JSON.stringify(manifest));return manifest;
}
