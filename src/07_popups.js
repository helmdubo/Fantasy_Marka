/* ================= BUILDING FEEDBACK POPUPS =================
Визуальный слой обратной связи: ресурсы, жители, покупки и корабельный прогресс
показываются над конкретными зданиями. Это не симуляция, а feedback-module — его можно
расширять без переписывания экономики/рынка заявок.
*/
function fmtRes(v){return Math.abs(v%1)<0.05?String(Math.round(v)):Number(v).toFixed(1)}
function worldToScreen(wx,wy){
  if(!R||!R.camera)return {x:0,y:0};
  const p=ppt();
  const rect=R.canvas.getBoundingClientRect ? R.canvas.getBoundingClientRect() : {left:0,top:0,width:R.canvas.width,height:R.canvas.height};
  const sx=(wx-R.camera.left)*p;
  const sy=(R.camera.top-wy)*p;
  const cssX=rect.left + sx*(rect.width/Math.max(1,R.canvas.width));
  const cssY=rect.top + sy*(rect.height/Math.max(1,R.canvas.height));
  return {x:cssX,y:cssY};
}
function cellToWorldAnchor(x,y,kind){
  // Единственная точка привязки DOM-feedback к entity: cell -> Three.js world -> CSS overlay.
  const h=kind==='low'?0.18:(kind==='portbar'?0.12:0.92);
  return {x:WXC(x),y:WYCC(x,y)-0.5+h};
}
function popupAnchor(x,y,kind){return cellToWorldAnchor(x,y,kind)}
function popupHtml(iconKey,text){
  const src=ICONS&&ICONS[iconKey];
  return (src?'<img src="'+src+'">':'')+'<span>'+text+'</span>';
}
function addPopupCell(x,y,html,cls,ttl){
  if(!IS_BROWSER||!S)return;
  const layer=document.getElementById('fxLayer');
  if(!layer)return;
  const a=popupAnchor(x,y);
  const e=document.createElement('div');
  e.className='fxpop '+(cls||'info');
  e.innerHTML=html;
  layer.appendChild(e);
  const pop={x:a.x,y:a.y,t:0,ttl:ttl||1.25,el:e,seed:Math.floor((S.rng?S.rng():Math.random())*9999)};
  S.popups.push(pop);
  updateOnePopup(pop);
}
function addResourcePopup(r,delta,x,y){
  if(!delta||!isFinite(delta))return;
  const sign=delta>0?'+':'−';
  addPopupCell(x,y,popupHtml(r,sign+fmtRes(delta)),delta>0?'pos':'neg',1.15);
}
function addInfoPopup(iconText,x,y,cls){
  addPopupCell(x,y,'<span>'+iconText+'</span>',cls||'info',1.25);
}
function addStock(r,delta,x,y){
  if(r==='gold')S.gold+=delta;else S.stock[r]+=delta;
  addResourcePopup(r,delta,x,y);
}
function updateOnePopup(p){
  if(!p.el)return;
  const q=worldToScreen(p.x,p.y);
  const f=clamp(p.t/p.ttl,0,1);
  const lift=22*f;
  const jitter=((p.seed%5)-2)*0.35*f;
  p.el.style.left=Math.round(q.x+jitter)+'px';
  p.el.style.top=Math.round(q.y-lift)+'px';
  p.el.style.opacity=String(Math.max(0,1-f));
  // Быстрый pixel-dissolve: в конце исчезает ступенчато, не плавной плашкой.
  if(f>0.62){
    const step=Math.floor((f-0.62)/0.095);
    p.el.style.clipPath=['none','polygon(0 0,100% 0,100% 82%,0 100%)','polygon(0 0,100% 8%,88% 100%,0 78%)','polygon(12% 0,100% 20%,76% 100%,0 70%)','polygon(28% 0,92% 30%,64% 100%,12% 72%)'][Math.min(4,step)];
  }
}
function updatePopups(dt){
  if(!IS_BROWSER||!S||!S.popups)return;
  for(let i=S.popups.length-1;i>=0;i--){
    const p=S.popups[i];p.t+=dt;
    if(p.t>=p.ttl){if(p.el&&p.el.parentNode)p.el.parentNode.removeChild(p.el);S.popups.splice(i,1);continue}
    updateOnePopup(p);
  }
}
function updatePortBars(){
  if(!IS_BROWSER||!R||!S)return;
  const layer=document.getElementById('fxLayer');if(!layer)return;
  if(!S.portBars)S.portBars=new Map();
  const alive=new Set();
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(!b||!b.built||b.type!=='port'||!b.sailing)continue;
    alive.add(bi);
    let node=S.portBars.get(bi);
    if(!node){
      node=document.createElement('div');node.className='portbar';node.innerHTML='<div></div>';layer.appendChild(node);S.portBars.set(bi,node);
    }
    const a=cellToWorldAnchor(b.x,b.y,'portbar');
    const q=worldToScreen(a.x,a.y);
    const f=b.sailTotal?clamp(1-(b.sailLeft||0)/b.sailTotal,0,1):0;
    node.style.left=Math.round(q.x-19)+'px';node.style.top=Math.round(q.y-24)+'px';
    node.firstChild.style.width=Math.round(f*100)+'%';
    node.title=(b.sailMode==='import'?'Импортный корабль':'Корабль')+' возвращается: '+Math.round(f*100)+'%';
  }
  for(const [id,node] of [...S.portBars.entries()]){
    if(!alive.has(id)){if(node.parentNode)node.parentNode.removeChild(node);S.portBars.delete(id)}
  }
}
function clearFeedbackLayer(){
  if(!IS_BROWSER)return;
  const layer=document.getElementById('fxLayer');if(layer)layer.innerHTML='';
  if(S){S.popups=[];S.portBars=new Map()}
}
