const DB='semantic-cosmos-v2';
export function openStore(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('snapshots');db.createObjectStore('checkpoints');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function storeValue(store,key,value){const db=await openStore();try{await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('写入被中断'));});}finally{db.close();}}
export async function readValue(store,key){const db=await openStore();try{return await new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}finally{db.close();}}
export const saveWorkspace=graph=>storeValue('snapshots','current',{savedAt:new Date().toISOString(),graph});
export async function loadWorkspace(){return(await readValue('snapshots','current'))?.graph||null;}
export async function requestPersistence(){try{return await navigator.storage?.persist?.()||false}catch{return false}}
