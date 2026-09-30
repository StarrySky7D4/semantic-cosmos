import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WasmKernel} from '../src/wasm.js';
import {construct,dot,unit} from '../src/core.js';
import {normalizeTexts,DEFAULT_PARAMETERS,datasetFrom} from '../src/adapters.js';
import {SPACE_SCALE,fitTopics,locateText,distance,shortWorm,topicTarget} from '../src/space.js';
const bytes=readFileSync('public/wasm/cosmos_core.wasm');
const data=JSON.parse(readFileSync('public/data/news-vectors.json'));
test('real dataset accounting, IDs and embedding geometry',()=>{const raw=JSON.parse(readFileSync('public/data/news-source.json'));const normalized=normalizeTexts(raw);assert.equal(normalized.records.length,29);assert.equal(normalized.themes.length,6);assert.equal(normalized.records.filter(r=>r.inWindow===false).length,4);assert.equal(normalized.warnings.length,2);assert.equal(new Set(data.records.map(r=>r.id)).size,29);for(const v of data.vectors){assert.equal(v.length,512);assert.ok(Math.abs(dot(v,v)-1)<1e-5);}});
test('WASM numeric kernel recovers known average-linkage and nearest pairs',async()=>{const kernel=await WasmKernel.create(bytes);const V=[[1,0],[.99,.1],[0,1],[.1,.99]].map(unit);kernel.initialize(V);const bins=kernel.cluster(2);assert.deepEqual(bins.map(b=>b.slice().sort()).sort((a,b)=>a[0]-b[0]),[[0,1],[2,3]]);const neighbors=kernel.neighbors(1);assert.deepEqual(neighbors.map(r=>r[0].j),[1,0,3,2]);const tree=kernel.linkage([0,1,2,3]);assert.equal(tree.members.length,4);const expected=(dot(V[0],V[2])+dot(V[0],V[3])+dot(V[1],V[2])+dot(V[1],V[3]))/4;assert.ok(Math.abs(tree.score-expected)<1e-5);assert.equal(kernel.cross(.9).length,0);kernel.dispose();});
test('real graph forest, edge scores, cross-root limits and deterministic rebuild',async()=>{const kernel=await WasmKernel.create(bytes);const graph=construct(data,DEFAULT_PARAMETERS,kernel),again=construct(data,DEFAULT_PARAMETERS,kernel);assert.deepEqual(graph.roots,again.roots);assert.deepEqual(graph.edges,again.edges);assert.equal(graph.roots.length,4);assert.equal(graph.nodes.filter(n=>n.kind==='text').length,29);assert.equal(graph.edges.filter(e=>e.type==='tree').length,graph.nodes.length-graph.roots.length);const map=new Map(graph.nodes.map(n=>[n.id,n])),degree=new Map();for(const edge of graph.edges){const a=map.get(edge.source),b=map.get(edge.target);assert.ok(a&&b);if(edge.type!=='tree'){const score=dot(data.vectors[a.memberIndices[0]],data.vectors[b.memberIndices[0]]);assert.ok(Math.abs(score-edge.score)<1e-5);}if(edge.type==='knn')assert.equal(a.root,b.root);if(edge.type==='wormhole'){assert.notEqual(a.root,b.root);assert.ok(edge.score>=DEFAULT_PARAMETERS.tau_cross-1e-6);for(const id of[edge.leafSource,edge.leafTarget])degree.set(id,(degree.get(id)||0)+1);}}assert.ok([...degree.values()].every(v=>v<=2));assert.ok(graph.nodes.every(n=>n.pos.every(Number.isFinite)));const noCross=construct(data,{...DEFAULT_PARAMETERS,max_wormholes:0},kernel);assert.equal(noCross.edges.filter(e=>e.type==='wormhole').length,0);kernel.dispose();console.log('GRAPH',JSON.stringify({topics:graph.nodes.filter(n=>n.kind!=='text').length,edges:graph.edges.length,wormholes:graph.edges.filter(e=>e.type==='wormhole').length}));});
test('degenerate identical vectors still preserve each input once',async()=>{const kernel=await WasmKernel.create(bytes);kernel.initialize([[1,0],[1,0],[1,0],[1,0]]);const bins=kernel.cluster(4);assert.equal(bins.length,4);assert.deepEqual(bins.flat().sort(),[0,1,2,3]);kernel.dispose();});
test('protected microcluster linkage uses member counts rather than unweighted cluster averages',async()=>{const kernel=await WasmKernel.create(bytes);const V=[[1,0],[.9,.1],[.8,.2],[0,1],[.1,.99]].map(unit);kernel.initialize(V);const tree=kernel.linkageGroups([[0,1],[2],[3,4]]);let expected=0;for(const a of[0,1,2])for(const b of[3,4])expected+=dot(V[a],V[b])/6;assert.equal(tree.members.length,5);assert.ok(Math.abs(tree.score-expected)<1e-5);kernel.dispose();});
test('reject malformed imported vectors and duplicate document IDs',()=>{assert.throws(()=>datasetFrom({texts:['a','b'],vectors:[[0,0],[1,0]]}),/无效/);assert.throws(()=>datasetFrom({texts:[{id:'a',text:'a'},{id:'a',text:'b'}],vectors:[[1,0],[0,1]]}),/重复/);assert.throws(()=>datasetFrom({texts:['a','b'],vectors:[[1,0],[Infinity,1]]}),/无效/);});

test('free centres fit similarity-dependent exclusion and remain translation-centred',()=>{
 const V=[[1,0],[.99,.1],[-1,0]].map(unit),fit=fitTopics(V),again=fitTopics(V);
 assert.deepEqual(fit,again);assert.ok(distance(fit.positions[0],fit.positions[1])<.2*SPACE_SCALE);
 assert.ok(distance(fit.positions[0],fit.positions[2])>1.3*SPACE_SCALE);
 for(let axis=0;axis<3;axis++)assert.ok(Math.abs(fit.positions.reduce((s,p)=>s+p[axis],0))<1e-8);
 assert.ok(new Set(fit.positions.map(p=>Math.hypot(...p).toFixed(3))).size>1);assert.ok(fit.rms<.02);
 assert.ok(topicTarget(1)<topicTarget(.8)&&topicTarget(.8)<topicTarget(0));
 const identical=fitTopics([[1,0],[1,0]]);assert.ok(distance(...identical.positions)>1);assert.ok(distance(...identical.positions)<30);
});
test('texts gather at a relevant centre, bridge equal themes and preserve translation covariance',()=>{
 const anchors=[{id:'a',vector:[1,0,0],pos:[-100,0,0],radius:20},{id:'b',vector:[0,1,0],pos:[100,0,0],radius:20}];
 const shared=unit([1,1,0]),bridge=locateText(shared,anchors);assert.equal(bridge.placement,'bridge');assert.ok(Math.hypot(...bridge.pos)<1e-8);
 const shifted=anchors.map(a=>({...a,pos:a.pos.map((x,i)=>x+[1000,20,30][i])}));assert.ok(distance(locateText(shared,shifted).pos,[1000,20,30])<1e-8);
 const selective=locateText([1,0,0],anchors);assert.equal(selective.placement,'cluster');assert.deepEqual(selective.pos,anchors[0].pos);
 const outlier=locateText([0,0,1],anchors);assert.equal(outlier.placement,'outlier');anchors.forEach(a=>assert.ok(distance(outlier.pos,a.pos)>SPACE_SCALE+a.radius));
 const unknown=locateText([1,0,0],anchors,{scopeVectors:[[0,0,1]]});assert.equal(unknown.placement,'outlier');
 const vector=unit([.8,.6,0]),loose=locateText(vector,anchors,{density:0}),dense=locateText(vector,anchors,{density:1});assert.ok(dense.distanceToTopic<loose.distanceToTopic);
});
test('density tightens topic centres and their texts while preserving hierarchy and short worms',async()=>{
 const kernel=await WasmKernel.create(bytes),graph=construct(data,DEFAULT_PARAMETERS,kernel),map=new Map(graph.nodes.map(n=>[n.id,n]));
 graph.nodes.filter(n=>n.kind!=='text').forEach(n=>assert.ok(n.localRadius>=8&&Number.isFinite(n.localRadius)));
 graph.nodes.filter(n=>n.kind==='text').forEach(n=>{assert.equal(map.get(n.nearestTopic).kind,'leaf');assert.ok(Math.abs(n.distanceToTopic-distance(n.pos,map.get(n.nearestTopic).pos))<1e-8);});
 graph.edges.filter(e=>e.type==='wormhole').forEach(e=>{assert.ok(shortWorm(map.get(e.source).pos,map.get(e.target).pos,graph.parameters.max_worm_length));assert.ok(Math.abs(e.lengthNormalized-distance(map.get(e.source).pos,map.get(e.target).pos)/SPACE_SCALE)<1e-10);});
 const noWorm=construct(data,{...DEFAULT_PARAMETERS,max_worm_length:0},kernel);assert.equal(noWorm.edges.filter(e=>e.type==='wormhole').length,0);
 const scoped=construct(data,{...DEFAULT_PARAMETERS,relevance_floor:.95},kernel);assert.ok(scoped.nodes.filter(n=>n.kind==='text').every(n=>n.placement==='outlier'&&n.distanceToTopic>SPACE_SCALE));
 const loose=construct(data,{...DEFAULT_PARAMETERS,density:0},kernel),dense=construct(data,{...DEFAULT_PARAMETERS,density:1},kernel);
 const compactness=g=>{const topics=g.nodes.filter(n=>n.kind!=='text');return topics.reduce((sum,n)=>sum+Math.min(...topics.filter(t=>t!==n).map(t=>distance(n.pos,t.pos))),0)/topics.length;};
 const meanTextDistance=g=>g.nodes.filter(n=>n.kind==='text').reduce((s,n)=>s+n.distanceToTopic,0)/g.texts.length;
 assert.ok(compactness(dense)<compactness(loose)*.7);assert.ok(meanTextDistance(dense)<meanTextDistance(loose)*.6);
 assert.deepEqual(loose.nodes.map(n=>[n.id,n.parent,n.members]),dense.nodes.map(n=>[n.id,n.parent,n.members]));
 assert.equal(shortWorm([0,0,0],[225,0,0],.65),false);assert.equal(shortWorm([0,0,0],[100,0,0],.65),true);
 assert.deepEqual(graph.nodes.map(n=>n.pos),construct(data,DEFAULT_PARAMETERS,kernel).nodes.map(n=>n.pos));kernel.dispose();
});
