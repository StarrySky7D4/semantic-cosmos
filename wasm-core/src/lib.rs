//! CPU numerical kernel. Single-threaded wasm32; no network, filesystem or JS imports.
use std::slice;

#[no_mangle]
pub extern "C" fn alloc_words(len: usize) -> *mut f32 {
    let buffer = vec![0.0_f32; len].into_boxed_slice();
    Box::into_raw(buffer) as *mut f32
}
#[no_mangle]
pub unsafe extern "C" fn free_words(ptr: *mut f32, len: usize) {
    if len > 0 { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len))); }
}
#[no_mangle]
pub extern "C" fn api_version() -> u32 { 2 }

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x,y)|x*y).sum::<f32>().clamp(-1.0,1.0)
}
#[no_mangle]
pub unsafe extern "C" fn normalize(ptr: *mut f32, n: usize, d: usize) -> i32 {
    let values=slice::from_raw_parts_mut(ptr,n*d);
    for row in values.chunks_exact_mut(d) {
        let norm=row.iter().map(|x|x*x).sum::<f32>().sqrt();
        if !norm.is_finite() || norm < 1e-12 { return -1; }
        for x in row { *x/=norm; }
    }
    0
}
#[no_mangle]
pub unsafe extern "C" fn kmeans(ptr: *const f32,n:usize,d:usize,k:usize,out:*mut u32)->u32 {
    if n<2 || d<2 || k<1 || k>n {return 0;}
    let v=slice::from_raw_parts(ptr,n*d);let labels=slice::from_raw_parts_mut(out,n);
    let mut centers=Vec::with_capacity(k*d);centers.extend_from_slice(&v[0..d]);
    for _ in 1..k {
        let mut best=-2.0;let mut index=0;
        for i in 0..n {let dist=1.0-centers.chunks_exact(d).map(|c|dot(&v[i*d..(i+1)*d],c)).fold(-2.0,f32::max);if dist>best {best=dist;index=i;}}
        centers.extend_from_slice(&v[index*d..(index+1)*d]);
    }
    labels.fill(u32::MAX);
    for _ in 0..30 {
        let mut changed=false;let mut counts=vec![0usize;k];
        for i in 0..n {let mut best=-2.0;let mut r=0;for c in 0..k {let score=dot(&v[i*d..(i+1)*d],&centers[c*d..(c+1)*d]);if score>best {best=score;r=c;}}if labels[i]!=r as u32 {changed=true;}labels[i]=r as u32;counts[r]+=1;}
        for r in 0..k {if counts[r]==0 {let mut pick=None;let mut best=-2.0;for i in 0..n {let old=labels[i] as usize;if counts[old]>1 {let dist=1.0-dot(&v[i*d..(i+1)*d],&centers[old*d..(old+1)*d]);if dist>best {best=dist;pick=Some(i);}}}if let Some(i)=pick {counts[labels[i] as usize]-=1;labels[i]=r as u32;counts[r]+=1;changed=true;}}}
        centers.fill(0.0);for i in 0..n {let offset=labels[i] as usize*d;for j in 0..d {centers[offset+j]+=v[i*d+j];}}
        for r in 0..k {let norm=centers[r*d..(r+1)*d].iter().map(|x|x*x).sum::<f32>().sqrt();if norm>1e-12 {for j in 0..d {centers[r*d+j]/=norm;}}else if let Some(i)=(0..n).find(|&i|labels[i] as usize==r){centers[r*d..(r+1)*d].copy_from_slice(&v[i*d..(i+1)*d]);}}
        if !changed {break;}
    }
    k as u32
}

/// Output merge rows: left cluster index, right cluster index, cosine score, size.
#[no_mangle]
pub unsafe extern "C" fn average_linkage(ptr:*const f32,n:usize,d:usize,indices:*const u32,m:usize,out:*mut f32)->u32 {
    if m<2 {return 0;}
    let v=slice::from_raw_parts(ptr,n*d);let ids=slice::from_raw_parts(indices,m);let rows=slice::from_raw_parts_mut(out,(m-1)*4);
    let width=2*m-1;let mut scores=vec![0.0_f32;width*width];let mut active=vec![false;width];let mut counts=vec![1usize;width];
    active[0..m].fill(true);
    for a in 0..m {for b in a+1..m {let i=ids[a] as usize;let j=ids[b] as usize;let s=dot(&v[i*d..(i+1)*d],&v[j*d..(j+1)*d]);scores[a*width+b]=s;scores[b*width+a]=s;}}
    for step in 0..m-1 {let next=m+step;let mut best=-2.0;let(mut aa,mut bb)=(0,0);for a in 0..next {if active[a] {for b in a+1..next {if active[b]&&scores[a*width+b]>best {best=scores[a*width+b];aa=a;bb=b;}}}}
        let ca=counts[aa];let cb=counts[bb];active[aa]=false;active[bb]=false;counts[next]=ca+cb;
        for c in 0..next {if active[c] {let s=(scores[c*width+aa]*ca as f32+scores[c*width+bb]*cb as f32)/(ca+cb) as f32;scores[c*width+next]=s;scores[next*width+c]=s;}}
        active[next]=true;rows[step*4]=aa as f32;rows[step*4+1]=bb as f32;rows[step*4+2]=best;rows[step*4+3]=(ca+cb) as f32;
    }
    (m-1) as u32
}

/// Weighted exact average linkage between protected terminal groups.
#[no_mangle]
pub unsafe extern "C" fn average_linkage_groups(ptr:*const f32,n:usize,d:usize,indices:*const u32,m:usize,groups:*const u32,g:usize,out:*mut f32)->u32 {
    if g<2 {return 0;}
    let v=slice::from_raw_parts(ptr,n*d);let ids=slice::from_raw_parts(indices,m);let labels=slice::from_raw_parts(groups,m);let rows=slice::from_raw_parts_mut(out,(g-1)*4);
    let width=2*g-1;let mut scores=vec![0.0_f32;width*width];let mut active=vec![false;width];let mut counts=vec![0usize;width];active[0..g].fill(true);
    for &label in labels {counts[label as usize]+=1;}
    for a in 0..m {for b in a+1..m {let aa=labels[a] as usize;let bb=labels[b] as usize;if aa!=bb {let i=ids[a] as usize;let j=ids[b] as usize;let s=dot(&v[i*d..(i+1)*d],&v[j*d..(j+1)*d]);scores[aa*width+bb]+=s;scores[bb*width+aa]+=s;}}}
    for a in 0..g {for b in a+1..g {let s=scores[a*width+b]/(counts[a]*counts[b]) as f32;scores[a*width+b]=s;scores[b*width+a]=s;}}
    for step in 0..g-1 {let next=g+step;let mut best=-2.0;let(mut aa,mut bb)=(0,0);for a in 0..next {if active[a] {for b in a+1..next {if active[b]&&scores[a*width+b]>best {best=scores[a*width+b];aa=a;bb=b;}}}}
        let ca=counts[aa];let cb=counts[bb];active[aa]=false;active[bb]=false;counts[next]=ca+cb;
        for c in 0..next {if active[c] {let s=(scores[c*width+aa]*ca as f32+scores[c*width+bb]*cb as f32)/(ca+cb) as f32;scores[c*width+next]=s;scores[next*width+c]=s;}}
        active[next]=true;rows[step*4]=aa as f32;rows[step*4+1]=bb as f32;rows[step*4+2]=best;rows[step*4+3]=(ca+cb) as f32;
    }
    (g-1) as u32
}

/// Directed top-k within each root; (-1,0) means no candidate, never a zero-similarity edge.
#[no_mangle]
pub unsafe extern "C" fn knn(ptr:*const f32,n:usize,d:usize,labels:*const u32,k:usize,out:*mut f32) {
    let v=slice::from_raw_parts(ptr,n*d);let labels=slice::from_raw_parts(labels,n);let out=slice::from_raw_parts_mut(out,n*k*2);
    for i in 0..n {let mut candidates=Vec::new();for j in 0..n {if i!=j&&labels[i]==labels[j] {let s=dot(&v[i*d..(i+1)*d],&v[j*d..(j+1)*d]);candidates.push((j,s));}}
        candidates.sort_by(|a,b|b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        for t in 0..k {let offset=(i*k+t)*2;if let Some(&(j,s))=candidates.get(t){out[offset]=j as f32;out[offset+1]=s;}else {out[offset]=-1.0;out[offset+1]=0.0;}}
    }
}
/// Only cross-root pairs above threshold are emitted; caller applies leaf-level budgets.
#[no_mangle]
pub unsafe extern "C" fn cross_candidates(ptr:*const f32,n:usize,d:usize,labels:*const u32,tau:f32,out:*mut f32,capacity:usize)->u32 {
    let v=slice::from_raw_parts(ptr,n*d);let labels=slice::from_raw_parts(labels,n);let out=slice::from_raw_parts_mut(out,capacity*3);let mut written=0;
    for i in 0..n {for j in i+1..n {if labels[i]!=labels[j] {let s=dot(&v[i*d..(i+1)*d],&v[j*d..(j+1)*d]);if s>=tau&&written<capacity {out[written*3]=i as f32;out[written*3+1]=j as f32;out[written*3+2]=s;written+=1;}}}}
    written as u32
}
