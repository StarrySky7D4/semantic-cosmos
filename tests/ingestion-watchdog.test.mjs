import test from 'node:test';
import assert from 'node:assert/strict';
import {embedRecords,cancelJobs} from '../src/workers-client.js';
test('bulk ingestion accepts ongoing progress but stops stalled inference; default deadline stays bounded',async t=>{
 const previous={Worker:globalThis.Worker,location:globalThis.location};const instances=[];
 globalThis.location={protocol:'http:'};globalThis.Worker=class{constructor(){instances.push(this);this.stopped=false;}postMessage(){}terminate(){this.stopped=true;}};
 t.mock.timers.enable({apis:['setTimeout']});
 try{
  const normal=embedRecords({records:[]},'wasm'),normalCheck=assert.rejects(normal,/180 seconds/);t.mock.timers.tick(179000);instances[0].onmessage({data:{type:'progress',message:'progress'}});t.mock.timers.tick(1000);await normalCheck;assert.equal(instances[0].stopped,true);
  const bulk=embedRecords({records:[]},'wasm',()=>{},{progressTimeout:true}),bulkCheck=assert.rejects(bulk,/无进度/);t.mock.timers.tick(179000);instances[1].onmessage({data:{type:'progress',message:'row checkpoint saved'}});t.mock.timers.tick(2000);assert.equal(instances[1].stopped,false);t.mock.timers.tick(178000);await bulkCheck;assert.equal(instances[1].stopped,true);
  const cancellable=embedRecords({records:[]},'wasm',()=>{},{progressTimeout:true}),cancelCheck=assert.rejects(cancellable);cancelJobs();await cancelCheck;assert.equal(instances[2].stopped,true);
 }finally{cancelJobs();t.mock.timers.reset();globalThis.Worker=previous.Worker;globalThis.location=previous.location;}
});
