export function normalizeWidgetSize(size){
  if(!size||!Number.isInteger(size.columns)||size.columns<3||size.columns>12||!Number.isInteger(size.height)||size.height!==0&&(size.height<160||size.height>960))throw new Error('Widget size must use 3–12 columns and an automatic height or 160–960 pixels.');
  return {columns:size.columns,height:size.height};
}

// Pointer Events support mouse, pen, and touch without a desktop-only drag API.
export function createLayoutGestures({canvas,canEdit,onAdd,onMove,onResize,onCancel,onAnnounce,phoneMode=()=>false}){
  let gesture=null,ghost=null,suppressUntil=0;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function cleanup(){ghost?.remove();ghost=null;canvas.classList.toggle('drop-active',false);for(const card of canvas.children)card.classList.toggle('drag-target',false);gesture=null;}
  function cancel(){const had=!!gesture;cleanup();if(had)onCancel();}
  function begin(event,action){
    if(!canEdit()||event.button>0||gesture)return;
    gesture={...action,pointerId:event.pointerId,x:event.clientX,y:event.clientY,moved:false,target:null};
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }
  function update(event){
    const g=gesture;if(!g||event.pointerId!==g.pointerId)return;if(!canEdit()){cancel();return;}
    const dx=event.clientX-g.x,dy=event.clientY-g.y;if(!g.moved&&Math.hypot(dx,dy)<6)return;g.moved=true;event.preventDefault();
    if(g.kind==='resize'){
      const phone=phoneMode(),mobile=window.innerWidth<=720&&!phone,columns=mobile?g.size.columns:clamp(Math.round(g.size.columns+dx/(Math.max(1,canvas.getBoundingClientRect().width)/12)),3,12),height=clamp(Math.round((g.startHeight+dy)/20)*20,160,960);g.next={columns,height};
      g.card.style.setProperty(phone?'--phone-cols':'--widget-cols',String(columns));g.card.style.setProperty('--widget-height',height+'px');g.card.classList.toggle('sized-widget',true);onAnnounce('Size: '+columns+' of 12 columns, '+height+' pixels high.');return;
    }
    if(!ghost){ghost=document.createElement('div');ghost.className='widget-drag-ghost';ghost.textContent=g.kind==='add'?'＋ '+g.label:'↕ '+g.label;ghost.setAttribute('aria-hidden','true');document.body.append(ghost);}
    ghost.style.left=event.clientX+14+'px';ghost.style.top=event.clientY+14+'px';
    const rect=canvas.getBoundingClientRect(),inside=event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
    canvas.classList.toggle('drop-active',inside);g.target=null;for(const card of canvas.children)card.classList.toggle('drag-target',false);
    if(inside){
      const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest?.('[data-widget-id]'),cards=[...canvas.children],index=cards.indexOf(hit);
      if(index>=0){const r=hit.getBoundingClientRect(),after=event.clientY>r.top+r.height*.65||(Math.abs(event.clientY-(r.top+r.height/2))<r.height*.3&&event.clientX>r.left+r.width/2);g.target={index:index+(after?1:0)};hit.classList.toggle('drag-target',true);}
      else g.target={index:cards.length};
    }
    if(event.clientY<70)window.scrollBy?.(0,-12);else if(event.clientY>window.innerHeight-70)window.scrollBy?.(0,12);
  }
  function finish(event){
    const g=gesture;if(!g||event.pointerId!==g.pointerId)return;const allowed=canEdit();cleanup();if(!allowed){onCancel();return;}
    if(!g.moved)return;suppressUntil=Date.now()+500;
    if(g.kind==='resize'){if(g.next)onResize(g.id,g.next);else onCancel();return;}
    if(!g.target){onCancel();onAnnounce('Drop cancelled. Place the widget inside the dashboard.');return;}
    if(g.kind==='add')onAdd(g.type,g.target.index);
    else{const from=[...canvas.children].findIndex(card=>card.getAttribute('data-widget-id')===g.id);onMove(g.id,g.target.index-(from<g.target.index?1:0));}
  }
  document.addEventListener('pointermove',update,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',event=>{if(gesture?.pointerId===event.pointerId)cancel();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&gesture){event.preventDefault();cancel();}});addEventListener('blur',cancel);
  return {beginAdd:(e,type,label)=>begin(e,{kind:'add',type,label}),beginMove:(e,id,label)=>begin(e,{kind:'move',id,label}),beginResize:(e,id,card,size)=>begin(e,{kind:'resize',id,card,size,startHeight:card.getBoundingClientRect().height}),isActive:()=>!!gesture,cancel,consumeClick:()=>Date.now()<suppressUntil};
}
