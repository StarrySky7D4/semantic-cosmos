import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSource,connectSource,readSourceFile,DEFAULT_DRIVE} from '../src/sources.js';
const sha='a'.repeat(40);
const response=raw=>new Response(JSON.stringify(raw));
test('parse real GitHub and Drive links; reject credentials and foreign hosts',()=>{
 assert.equal(parseSource('drive',DEFAULT_DRIVE).id,'1Yk6sz2B9RmpSlf0dopd6YZsXZbb4Pcvo');
 assert.equal(parseSource('drive','https://drive.google.com/file/d/abc_123/view').folder,false);
 assert.equal(parseSource('github','https://github.com/a/b/tree/main').ref,'main');
 assert.equal(parseSource('github','https://github.com/a/b/blob/main/data/x.json').path,'data/x.json');
 for(const url of ['http://github.com/a/b','https://github.com.evil/a/b','https://secret@github.com/a/b','https://github.com:8443/a/b'])assert.throws(()=>parseSource('github',url));
 assert.throws(()=>parseSource('github','https://github.com/a/b/blob/main/%ZZ'),/URL 编码/);
});
test('directory listing pins raw content to commit and honors paths and branch override',async()=>{
 const calls=[];const fetcher=async(url,opts)=>{calls.push(url);assert.equal(opts.credentials,'omit');return response(calls.length===1?{default_branch:'main'}:calls.length===2?{sha}:{sha:'b'.repeat(40),tree:[{type:'blob',path:'data/x.json',size:20},{type:'blob',path:'package.json'},{type:'blob',path:'data/readme.md'}]})};
 const result=await connectSource(parseSource('github','https://github.com/a/b/tree/main/data'),{ref:'feature/source',fetcher});
 assert.equal(result.files.length,1);assert.match(calls[1],/feature%2Fsource/);assert.match(result.files[0].url,new RegExp('/'+sha+'/data/x.json$'));
});
test('Drive folder fails closed without network or fake success',async()=>{
 await assert.rejects(connectSource(parseSource('drive',DEFAULT_DRIVE),{fetcher:()=>{throw Error('must not fetch')}}),/下载到本地/);
});
test('reject HTTP failure, truncated tree, login HTML, unrelated JSON and excessive payload',async()=>{
 await assert.rejects(connectSource(parseSource('github','https://github.com/a/b'),{fetcher:async()=>new Response('',{status:404})}),/404/);
 let n=0;await assert.rejects(connectSource(parseSource('github','https://github.com/a/b'),{fetcher:async()=>response(++n===1?{default_branch:'main'}:n===2?{sha}:{truncated:true})}),/截断/);
 await assert.rejects(readSourceFile({url:'https://example.test'},async()=>new Response('<html>login</html>')),/JSON/);
 await assert.rejects(readSourceFile({url:'https://example.test'},async()=>response({name:'package'})),/数据集/);
 await assert.rejects(readSourceFile({url:'https://example.test',size:41*1024*1024}),/40 MB/);
 const actual=await readSourceFile({url:'https://example.test'},async()=>response({items:[{id:'real',title:'原文'}]}));assert.deepEqual(actual.items,[{id:'real',title:'原文'}]);assert.equal(actual.meta.ingestionSource.url,'https://example.test');
});
test('native records/vector bundle retains IDs, evidence, vectors and source metadata',async()=>{
 const bundle={records:[{id:'stable',title:'标题',text:'原文',evidence_category:'unknown',sources:[{url:'https://example.test/original'}]}],vectors:[[1,0]],sourceMeta:{window_start:'2026-03-30'},embedding:{backend:'wasm'}};
 const raw=await readSourceFile({url:'https://example.test/bundle'},async()=>response(bundle));assert.deepEqual(raw.texts,bundle.records);assert.deepEqual(raw.vectors,bundle.vectors);assert.equal(raw.meta.window_start,bundle.sourceMeta.window_start);assert.deepEqual(raw.embedding,bundle.embedding);
});
