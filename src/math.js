export function dot(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s}
export function unit(a){const n=Math.sqrt(dot(a,a));if(!Number.isFinite(n)||n<1e-12)throw Error('向量含非有限数值或为零');return a.map(x=>x/n)}
export const add=(a,b)=>a.map((x,i)=>x+b[i]),scale=(a,s)=>a.map(x=>x*s);
export function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
export function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
export function random(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
