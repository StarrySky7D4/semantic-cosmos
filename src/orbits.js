// Presentation-only Kepler orbits. Never write back to semantic node coordinates.
const TAU=Math.PI*2;
const add=(a,b)=>a.map((x,i)=>x+b[i]), scale=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const norm=a=>scale(a,1/(Math.hypot(...a)||1));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function seeded(id){let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h+=0x6D2B79F5;let x=h;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return((x^x>>>14)>>>0)/4294967296;};}
export function frame(id,variation=0){const r=seeded(id),inclination=.25+r()*2.5+variation,ascendingNode=r()*TAU;return {inclination,ascendingNode,u:[Math.cos(ascendingNode),0,Math.sin(ascendingNode)],v:[-Math.sin(ascendingNode)*Math.cos(inclination),Math.sin(inclination),Math.cos(ascendingNode)*Math.cos(inclination)]};}
export function ellipse(orbit,E){return add(scale(orbit.u,orbit.a*(Math.cos(E)-orbit.e)),scale(orbit.v,orbit.a*Math.sqrt(1-orbit.e**2)*Math.sin(E)));}
export function eccentricAnomaly(mean,e){let E=mean%TAU;for(let i=0;i<6;i++)E-=(E-e*Math.sin(E)-mean%TAU)/(1-e*Math.cos(E));return E;}
export function at(orbit,seconds){return add(orbit.center,ellipse(orbit,eccentricAnomaly(orbit.phase+TAU*seconds/orbit.period,orbit.e)));}
export function path(orbit,segments=32){return Array.from({length:segments+1},(_,i)=>add(orbit.center,ellipse(orbit,i/segments*TAU)));}
export function sceneOrbit(node,systemId){const r=seeded(node.id),base=frame(systemId),normal=norm(cross(base.u,base.v)),tilt=(r()-.5)*.18,a=node.role==='source'?22+(node.sourceIndex||0)*12:Math.max(22,Math.min(78,Math.hypot(...node.pos)*.8+18)),e=.06+r()*.2;const orbit={...base,v:add(scale(base.v,Math.cos(tilt)),scale(normal,Math.sin(tilt))),a,e,phase:r()*TAU,period:12*Math.pow(a/50,1.5)+5,center:[0,0,0]};orbit.normal=norm(cross(orbit.u,orbit.v));orbit.trail=path(orbit,32);return orbit;}
export class OrbitClock{
 constructor(){this.time=0;this.last=null;this.speed=1;this.paused=false;this.hidden=false;this.local=new Map();}
 tick(now){if(this.last!==null&&!this.paused&&!this.hidden)this.time+=Math.max(0,now-this.last)/1000*this.speed;this.last=now;return this.time;}
 sync(){this.last=null;}
 seconds(id){const s=this.local.get(id);return s?(s.frozen??this.time)-s.offset:this.time;}
 freeze(id){if(!id)return;let s=this.local.get(id);if(!s){s={offset:0,frozen:null};this.local.set(id,s);}if(s.frozen===null)s.frozen=this.time;}
 resume(id){const s=this.local.get(id);if(s?.frozen!==null&&s?.frozen!==undefined){s.offset+=this.time-s.frozen;s.frozen=null;}}
 reset(){this.time=0;this.sync();for(const s of this.local.values()){s.offset=0;if(s.frozen!==null)s.frozen=0;}}
}
export class OrbitalDisplay{
 constructor(graph){this.graph=graph;this.clock=new OrbitClock();this.cache=new Map();this.satelliteCache=new Map();this.frozenSystem=null;}
 system(node){return node?.kind==='text'?node.parent:node?.kind==='leaf'?node.id:null;}
 reading(node){const id=this.system(node);if(id===this.frozenSystem)return;this.clock.resume(this.frozenSystem);this.frozenSystem=id;this.clock.freeze(id);}
 release(){this.clock.resume(this.frozenSystem);this.frozenSystem=null;}
 orbit(node){if(this.cache.has(node.id))return this.cache.get(node.id);const parent=this.graph.map.get(node.parent),r=seeded(node.id),base=frame(node.parent),tilt=(r()-.5)*.2;
  // Systems share a plane with small per-planet deviations. The constant normal
  // residual keeps the initial semantic position exactly, even for 3D layouts.
  const normal=norm(cross(base.u,base.v)),v=add(scale(base.v,Math.cos(tilt)),scale(normal,Math.sin(tilt))),relative=node.pos.map((x,i)=>x-parent.pos[i]),x=dot(relative,base.u),y=dot(relative,v),e=.06+r()*.22,radius=Math.hypot(x,y),unbounded=(radius-e*x)/(1-e*e),a=Math.max(2,Math.min(24,unbounded)),E=radius>1e-8?Math.atan2(y/(Math.max(unbounded,1e-8)*Math.sqrt(1-e*e)),x/Math.max(unbounded,1e-8)+e):r()*TAU;
  const orbit={...base,u:base.u,v,a,e,phase:E-e*Math.sin(E),period:12*Math.pow(a/10,1.5)+6};
  orbit.center=node.pos.map((x,i)=>x-ellipse(orbit,E)[i]);orbit.normal=norm(cross(orbit.u,orbit.v));orbit.trail=path(orbit);this.cache.set(node.id,orbit);return orbit;
 }
 position(node,enabled=true){return enabled&&node.kind==='text'?at(this.orbit(node),this.clock.seconds(this.system(node))):node.pos;}
 satellite(node,index){const key=node.id+':'+index;if(this.satelliteCache.has(key))return this.satelliteCache.get(key);const base=this.orbit(node),r=seeded(key),normal=norm(cross(base.u,base.v)),tilt=(r()-.5)*.45,orbit={u:base.u,v:add(scale(base.v,Math.cos(tilt)),scale(normal,Math.sin(tilt))),a:7+index*3,e:.04+r()*.15,phase:r()*TAU,period:3*Math.pow((7+index*3)/7,1.5),center:[0,0,0]};orbit.trail=path(orbit,24);this.satelliteCache.set(key,orbit);return orbit;}
 satellitePosition(node,index,enabled=true){return add(this.position(node,enabled),at(this.satellite(node,index),enabled?this.clock.seconds(this.system(node)):0));}
}
