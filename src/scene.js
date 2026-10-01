const copy=c=>({yaw:c.yaw,pitch:c.pitch,zoom:c.zoom,focus:c.focus.slice()});
export class SceneNavigator{
 constructor(presentation,load){this.presentation=presentation;this.load=load;this.scene=presentation.overview||presentation.scenes.universe;this.frames=[{id:'universe',scale:1,origin:[0,0,0]}];this.cache=new Map([['universe',this.scene]]);this.loading=new Map();this.busy=false;this.version=0;this.lastTransition=-Infinity;this.anchorError=0;}
 get active(){return this.frames.at(-1).id;}
 get frame(){return this.frames.at(-1);}
 async ensure(id){if(this.cache.has(id))return this.cache.get(id);if(this.loading.has(id))return this.loading.get(id);const p=Promise.resolve(this.load(id)).then(scene=>{if(!scene||scene.id!==id||!Array.isArray(scene.children))throw Error('场景分片无效');this.cache.set(id,scene);return scene;}).finally(()=>this.loading.delete(id));this.loading.set(id,p);return p;}
 async enter(node,camera,world,now=performance.now()){if(this.busy||!node.scopeId||node.scopeId===this.active)return false;this.busy=true;const version=++this.version;try{const next=await this.ensure(node.scopeId);if(version!==this.version||!next.children.length)return false;const parent=this.frame,origin=(typeof world==='function'?world():world).slice(),scale=parent.scale*node.radius/100;this.frames.push({id:next.id,scale,origin,parentNodeId:node.id,returnCamera:copy(camera)});this.scene=next;this.lastTransition=now;return true;}finally{if(version===this.version)this.busy=false;}}
 exit(camera,now=performance.now()){if(this.busy){this.version++;this.busy=false;}if(this.frames.length===1)return false;const leaving=this.frames.pop();this.scene=this.cache.get(this.active);Object.assign(camera,copy(leaving.returnCamera));this.lastTransition=now;return true;}
 home(camera){this.version++;this.busy=false;while(this.frames.length>1)this.exit(camera,-Infinity);this.scene=this.cache.get('universe');}
 path(){return this.frames.map(f=>this.presentation.scopes[f.id]);}
 canEnter(node,projectedRadius,viewport,now){return !this.busy&&!!node.scopeId&&node.scopeId!==this.active&&now-this.lastTransition>350&&projectedRadius>Math.min(...viewport)*.27;}
 canExit(projectedRadius,viewport,now){return this.frames.length>1&&!this.busy&&now-this.lastTransition>350&&projectedRadius<Math.min(...viewport)*.18;}
 world(local,frame=this.frame){return local.map((x,i)=>frame.origin[i]+x*frame.scale);}
}
