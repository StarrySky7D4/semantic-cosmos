import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptDocument,previewLocalFiles,localPath,LOCAL_LIMITS} from '../src/local-import.js';

const file=(name,raw,relative='')=>{const text=typeof raw==='string'?raw:JSON.stringify(raw);return {name,webkitRelativePath:relative,size:new TextEncoder().encode(text).length,text:async()=>text};};
const briefing={metadata:{title:'合成日报',generated_at:'2026-10-07',coverage_period:'最近一天',domains:['AI']},overview_cards:[{id:'card_1',category:'AI',title:'合成概览',summary:'合成摘要',keywords:['测试'],sources:[{name:'测试来源',url:'https://example.test/overview'}]}],deep_dive_analysis:[{topic:'合成深度',evolution_and_updates:'更新过程',perspectives:{开发者:'开发观点',用户:'用户观点'},long_term_impact:'长期影响'}],briefing_flash:[{field:'研究',headline:'合成快讯',source:{name:'快讯来源',url:'https://example.test/flash'}}]};
test('daily three sections retain deep analysis, perspectives and original source; generated time is not publication',async()=>{
 const out=await previewLocalFiles([file('daily.json',briefing)]);assert.equal(out.errors.length,0);assert.equal(out.recordCount,3);
 const [card,analysis,flash]=out.raw.texts;assert.equal(card.original_id,'card_1');assert.equal(card.date,null);assert.equal(card.generated_at,'2026-10-07');assert.match(analysis.text,/开发观点/);assert.match(analysis.text,/用户观点/);assert.match(analysis.text,/长期影响/);assert.equal(analysis.perspectives.开发者,'开发观点');assert.equal(flash.sources[0].name,'快讯来源');assert.equal(out.raw.meta.local_import.files[0].metadata.briefing_metadata.title,'合成日报');
});
test('timestamp articles retain full content, English title and retrieved fields; only published maps date',()=>{
 const out=adaptDocument({meta:{saved_at:'2026-10-07',timezone:'Asia/Shanghai',item_count:1,content_sha256:'test'},items:[{id:1,title:'新闻',title_en:'News',published:'2026-10-03T09:00:00+08:00',summary:'摘要',full_content:'完整正文',sources:[{name:'来源',url:'https://example.test',retrieved:'2026-10-07'}]}]});
 assert.equal(out.format,'timestamp-items');assert.equal(out.records[0].date,'2026-10-03');assert.match(out.records[0].summary,/完整正文/);assert.equal(out.records[0].original_summary,'摘要');assert.equal(out.records[0].title_en,'News');assert.equal(out.records[0].sources[0].retrieved,'2026-10-07');
 assert.equal(adaptDocument({meta:{saved_at:'2026-10-07'},items:[{id:2,title:'无日期'}]}).records[0].date,null);
});
test('corpus keeps authors, discussion links, source and license metadata',async()=>{
 const raw={meta:{generated_at:'2026-10-07',count:1,part:1,part_count:6,offset:0,license_note:'合成许可说明',sources:['arXiv','Hacker News']},items:[{id:'arxiv-test',type:'paper',title:'Paper',summary:'Summary',url:'https://example.test/paper',discussion_url:'https://example.test/discussion',source:'arXiv',published:'2026-10-03',authors:['Author A'],points:1,num_comments:2,categories:['cs.AI'],language:'en'}]};
 const out=await previewLocalFiles([file('part.json',raw)]);assert.equal(out.rows[0].format,'corpus-items');assert.deepEqual(out.raw.texts[0].authors,['Author A']);assert.equal(out.raw.texts[0].sources.length,2);assert.equal(out.raw.texts[0].discussion_url,raw.items[0].discussion_url);assert.equal(out.raw.meta.local_import.files[0].metadata.license_note,'合成许可说明');
});
test('file namespaces prevent card_1 collisions; IDs stable under file and id-less record reorder',async()=>{
 const a=file('a.json',briefing,'Root/daily/a.json'),b=file('b.json',{...briefing,metadata:{...briefing.metadata,title:'另一个日报'}} ,'Root/daily/b.json');
 const first=await previewLocalFiles([a,b]),second=await previewLocalFiles([b,a]);assert.equal(first.recordCount,6);assert.deepEqual(first.raw.texts.map(r=>r.id),second.raw.texts.map(r=>r.id));assert.notEqual(first.raw.texts[0].id,first.raw.texts[3].id);
 const records=['甲','乙'];const x=await previewLocalFiles([file('texts.json',records)]),y=await previewLocalFiles([file('texts.json',records.toReversed())]);assert.deepEqual(x.raw.texts.map(r=>r.id).sort(),y.raw.texts.map(r=>r.id).sort());assert.equal(localPath(a),'daily/a.json');
});
test('identical files/records deduplicate with aliases; conflicting same-file ID fails closed',async()=>{
 const raw={texts:[{id:'x',title:'重复'},{id:'x',title:'重复'}],vectors:[[1,0],[1,0]]};
 const out=await previewLocalFiles([file('z.json',raw),file('a.json',raw)]);assert.equal(out.recordCount,1);assert.equal(out.duplicateFiles,1);assert.equal(out.duplicates,1);assert.deepEqual(out.raw.texts[0].import_provenance.indices,[0,1]);assert.deepEqual(out.raw.texts[0].import_provenance.file_aliases,['z.json']);
 const conflict=await previewLocalFiles([file('bad.json',{texts:[{id:'x',title:'甲'},{id:'x',title:'乙'}]})]);assert.equal(conflict.raw,null);assert.match(conflict.errors.join(''),/原 ID/);
 const pathConflict=await previewLocalFiles([file('same.json',['甲']),file('same.json',['乙'])]);assert.equal(pathConflict.raw,null);assert.match(pathConflict.errors.join(''),/路径/);
});
test('manifest is metadata only, missing files/count mismatch explicit; mixed bad JSON blocks until excluded',async()=>{
 const manifest={generated_at:'2026-10-07',count:12000,description:'清单',sources:['arXiv'],license_note:'test',files:[{file:'part.json',count:2000,bytes:100},{file:'missing.json',count:2000,bytes:100}]};
 const selected=[file('manifest.json',manifest),file('part.json',{items:[{id:'p',title:'test'}]}),file('bad.json','{bad')];const bad=await previewLocalFiles(selected);assert.equal(bad.raw,null);assert.ok(bad.errors.some(e=>e.includes('JSON')));
 const good=await previewLocalFiles(selected.slice(0,2));assert.equal(good.recordCount,1);assert.equal(good.rows.find(r=>r.path==='manifest.json').status,'manifest');assert.ok(good.warnings.some(w=>w.includes('missing.json')));assert.ok(good.warnings.some(w=>w.includes('2000')));
 assert.equal((await previewLocalFiles([selected[0]])).raw,null);
});
test('mixed vectors trigger explicit re-embedding, compatible vectors retained and validated',async()=>{
 const a=file('a.json',{texts:[{id:'a',title:'甲'}],vectors:[[1,0]],embedding:{backend:'wasm'}}),b=file('b.json',{items:[{id:'b',title:'乙'}]});const mixed=await previewLocalFiles([a,b]);assert.equal(mixed.raw.vectors,undefined);assert.ok(mixed.warnings.some(w=>w.includes('重新嵌入')));
 const bad=await previewLocalFiles([file('bad.json',{texts:['甲'],vectors:[[0,0]]})]);assert.equal(bad.raw,null);
 const dimensions=await previewLocalFiles([a,file('c.json',{texts:['丙'],vectors:[[1,0,0]],embedding:{backend:'wasm'}})]);assert.equal(dimensions.raw.vectors,undefined);
 const compatible=await previewLocalFiles([file('one.json',{texts:['甲'],vectors:[[1,0]],model:'same-model',embedding:{backend:'wasm',revision:'same',inputSha256:'one',generatedAt:'time-one'}}),file('two.json',{texts:['乙'],vectors:[[0,1]],model:'same-model',embedding:{backend:'wasm',revision:'same',inputSha256:'two',generatedAt:'time-two'}})]);
 assert.equal(compatible.raw.vectors.length,2);assert.equal(compatible.raw.embedding.backend,'wasm');assert.equal(compatible.raw.embedding.inputSha256,undefined);assert.equal(compatible.raw.meta.local_import.files[1].embedding.inputSha256,'two');
});
test('graphs are standalone; invalid structured records and unknown formats are errors',async()=>{
 const graph={schema:'semantic-cosmos/v1',nodes:[],roots:[],texts:[]};const mixed=await previewLocalFiles([file('graph.json',graph),file('text.json',['甲'])]);assert.equal(mixed.raw,null);assert.ok(mixed.errors.some(e=>e.includes('图谱')));
 for(const raw of [{metadata:{title:'unsupported'}},{items:[{title:'甲',id:{bad:true}}]}])assert.equal((await previewLocalFiles([file('bad.json',raw)])).raw,null);
 const dates=adaptDocument({items:[{title:'未知日期',published:'2026-02-31'}]});assert.equal(dates.records[0].date,null);
});
test('cancel and size/file/record budgets do not silently truncate or read oversized inputs',async()=>{
 const controller=new AbortController();const slow=file('slow.json',['甲']);slow.text=async()=>{controller.abort();return '["甲"]'};await assert.rejects(previewLocalFiles([slow],{signal:controller.signal}),{name:'AbortError'});
 let reads=0;const huge={name:'huge.json',size:LOCAL_LIMITS.bytes+1,text:async()=>{reads++;return '[]'}};const size=await previewLocalFiles([huge]);assert.equal(size.raw,null);assert.equal(reads,0);
 assert.equal((await previewLocalFiles(Array.from({length:2001},()=>file('x.json',['x'])))).raw,null);
 const many=await previewLocalFiles([file('many.json',Array.from({length:20001},(_,i)=>'text '+i))]);assert.equal(many.raw,null);assert.ok(many.errors.some(e=>e.includes('20000')));
});
test('six synthetic 2000-item corpus parts + manifest import all 12000 without truncation',async()=>{
 const parts=Array.from({length:6},(_,part)=>file(`part-${part}.json`,{meta:{part:part+1,part_count:6,count:2000,license_note:'synthetic only'},items:Array.from({length:2000},(_,i)=>({id:`p${part}-${i}`,type:'paper',title:'Synthetic '+i,summary:'Synthetic content',source:'arXiv',url:`https://example.test/${part}/${i}`,authors:['Test'],published:'2026-10-03'}))}));
 const manifest=file('manifest.json',{generated_at:'2026-10-07',count:12000,files:parts.map(p=>({file:p.name,count:2000,bytes:p.size}))});
 const result=await previewLocalFiles([...parts,manifest]);assert.deepEqual(result.errors,[]);assert.equal(result.recordCount,12000);assert.equal(new Set(result.raw.texts.map(r=>r.id)).size,12000);assert.equal(result.raw.meta.local_import.files.length,7);
});
