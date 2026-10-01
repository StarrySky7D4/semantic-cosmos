// Select real adjacent children. No fabricated filler and no recursive expansion.
export function representatives(children,limit,score=()=>0,match=()=>true){
 return children.filter(match).map((node,index)=>({node,index,score:score(node)}))
  .sort((a,b)=>b.score-a.score||b.node.count-a.node.count||a.node.id.localeCompare(b.node.id))
  .slice(0,Math.max(0,limit)).map(x=>x.node);
}
export const expandsAdjacent=role=>['universe','galaxy','region'].includes(role);
