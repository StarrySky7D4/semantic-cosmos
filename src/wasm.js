export class WasmKernel {
  static async create(bytes) {
    const {instance}=await WebAssembly.instantiate(bytes,{});
    if(instance.exports.api_version()!==2)throw Error('WASM ABI 版本不匹配');
    return new WasmKernel(instance.exports);
  }
  constructor(exports){this.w=exports;this.allocations=[];}
  allocate(count){const ptr=this.w.alloc_words(Math.max(1,count));this.allocations.push([ptr,Math.max(1,count)]);return ptr;}
  floats(ptr,count){return new Float32Array(this.w.memory.buffer,ptr,count);}
  integers(ptr,count){return new Uint32Array(this.w.memory.buffer,ptr,count);}
  dispose(){for(const[ptr,count]of this.allocations)this.w.free_words(ptr,count);this.allocations=[];}
  initialize(vectors){this.dispose();this.n=vectors.length;this.d=vectors[0].length;this.vptr=this.allocate(this.n*this.d);this.floats(this.vptr,this.n*this.d).set(vectors.flat());if(this.w.normalize(this.vptr,this.n,this.d)!==0)throw Error('向量非有限或为零');}
  cluster(k){this.lptr=this.allocate(this.n);this.w.kmeans(this.vptr,this.n,this.d,k,this.lptr);this.labels=Array.from(this.integers(this.lptr,this.n));return Array.from({length:k},(_,r)=>this.labels.flatMap((v,i)=>v===r?[i]:[])).filter(b=>b.length);}
  linkage(indices){if(indices.length===1)return{members:indices,score:1,children:null};const m=indices.length,iptr=this.allocate(m),optr=this.allocate((m-1)*4);this.integers(iptr,m).set(indices);this.w.average_linkage(this.vptr,this.n,this.d,iptr,m,optr);const rows=Array.from(this.floats(optr,(m-1)*4));const tree=indices.map(i=>({members:[i],score:1,children:null}));for(let j=0;j<m-1;j++){const a=tree[rows[j*4]],b=tree[rows[j*4+1]];tree.push({members:a.members.concat(b.members),score:rows[j*4+2],children:[a,b]});}return tree.at(-1);}
  linkageGroups(groups){if(groups.length===1)return{members:groups[0],score:null,children:null};const ids=groups.flat(),labels=groups.flatMap((group,i)=>group.map(()=>i)),iptr=this.allocate(ids.length),lptr=this.allocate(ids.length),optr=this.allocate((groups.length-1)*4);this.integers(iptr,ids.length).set(ids);this.integers(lptr,ids.length).set(labels);this.w.average_linkage_groups(this.vptr,this.n,this.d,iptr,ids.length,lptr,groups.length,optr);const rows=Array.from(this.floats(optr,(groups.length-1)*4)),tree=groups.map(members=>({members,score:null,children:null}));for(let j=0;j<groups.length-1;j++){const a=tree[rows[j*4]],b=tree[rows[j*4+1]];tree.push({members:a.members.concat(b.members),score:rows[j*4+2],children:[a,b]});}return tree.at(-1);}
  neighbors(k){if(!k)return Array.from({length:this.n},()=>[]);const out=this.allocate(this.n*k*2);this.w.knn(this.vptr,this.n,this.d,this.lptr,k,out);const raw=Array.from(this.floats(out,this.n*k*2));return Array.from({length:this.n},(_,i)=>Array.from({length:k},(_,t)=>({j:raw[(i*k+t)*2],score:raw[(i*k+t)*2+1]})).filter(x=>x.j>=0));}
  cross(tau){const cap=this.n*(this.n-1)/2,out=this.allocate(cap*3),count=this.w.cross_candidates(this.vptr,this.n,this.d,this.lptr,tau,out,cap);const raw=Array.from(this.floats(out,count*3));return Array.from({length:count},(_,i)=>({i:raw[i*3],j:raw[i*3+1],score:raw[i*3+2]}));}
}
