import { styleWidgetTextScene } from './widget-text.js?v=0.36.1';
import { widgetIconId,widgetNumber } from './widget-settings.js?v=0.37.0';
import { WIDGET_DESIGN as S } from './widget-design.js?v=0.37.0';
const hex=v=>typeof v==='string'&&/^#[a-f0-9]{6}$/i.test(v),round=n=>Math.round(n*1000)/1000;
export function widgetAppearance(w={},inherited='mint'){
 const theme=S.themes[w.theme]?w.theme:S.themes[inherited]?inherited:'mint',base=S.themes[theme],colors={};
 for(const [role,token]of Object.entries(S.roles))colors[role]=hex(w.design?.colors?.[role])?w.design.colors[role]:S.legacyAccentRoles.includes(role)&&hex(w.design?.color)?w.design.color:base[token];
 S.seriesColors.forEach((v,i)=>colors['series'+(i+1)]=v);return{theme,colors};
}
export function applyWidgetAppearance(element,w,inherited='mint'){const a=widgetAppearance(w,inherited);for(const [k,v]of Object.entries(a.colors))element.style.setProperty('--widget-'+k,v);element.style.setProperty('--teal',a.colors.accent);for(const k of ['muted','surface'])element.style.setProperty('--'+k,a.colors[k]);element.style.setProperty('--line',a.colors.border);return a;}
/** A deterministic inert drawing plan, never a command/media transport. */
export function widgetScene(w={},inherited='mint',width=300,fontScale=1,channel={}){
 width=Math.max(120,Math.min(720,Math.round(width)));fontScale=Math.max(1,Math.min(2,Number(fontScale)||1));const face=S.behaviorFaces?.[w.type+':'+(w.behavior?.version===1?w.behavior.variant:'')]||S.faces[w.type]||S.faces.value,a=widgetAppearance(w,inherited),sx=(width-28)/272;
 const io=channel.config?.io||{},min=Number.isFinite(w.min)?w.min:Number.isFinite(io.min)?io.min:0,max=Number.isFinite(w.max)?w.max:Number.isFinite(io.max)?io.max:100,unit=channel.unit||'',tokens={title:String(w.title||S.labels[w.type]||'Widget').slice(0,40),value:widgetNumber(26,channel,w),unit,min:String(min),max:String(max)};
 const text=t=>String(t).replace(/\$(title|value|unit|min|max)/g,(_,k)=>tokens[k]).trim();
 const raw=[{kind:'icon',x:14,y:14,width:20,height:20,role:'icon',type:widgetIconId(w)},{kind:'text',text:'$title',x:44,y:30,size:13,role:'title',header:true},...face.elements,{kind:'text',text:'Synthetic example · inactive',x:16,y:face.height-12,size:10,role:'muted'}];
 const elements=raw.map(original=>{const e=structuredClone(original);if(e.x!==undefined)e.x=round(14+(e.x-14)*sx);if(e.x2!==undefined)e.x2=round(14+(e.x2-14)*sx);if(e.width!==undefined&&e.kind!=='icon')e.width=round(e.width*sx);if(e.points)e.points=e.points.map(([x,y])=>[round(14+(x-14)*sx),y]);if(e.header)e.x=44;if(e.kind==='text'){if(['status','led'].includes(w.type)&&e.text==='On · example')e.text=(w.on_label||'On')+' · example';if(w.type==='value'&&e.text==='LATEST READING · example')e.text=({mean:'SAMPLE AVERAGE',min:'MINIMUM',max:'MAXIMUM'}[w.aggregation]||'LATEST READING')+' · example';e.text=text(e.text);const available=e.x===44?width-58:width-28;if(e.header&&e.text.length*5.8>available)e.text=e.text.slice(0,Math.max(1,Math.floor(available/5.8)-1))+'…';e.size=round(Math.min(e.size*fontScale,Math.max(10,available/Math.max(1,e.text.length*.58))));if(e.role==='value'&&!e.align&&['center','right'].includes(w.design?.align)){e.align=w.design.align;e.x=e.align==='center'?width/2:width-14;}}return e;});return styleWidgetTextScene({version:1,type:w.type||'value',width,height:face.height,appearance:a,elements},w,fontScale);
}
export function renderWidgetScene(w,inherited,width=300,fontScale=1,channel={}){
 const scene=widgetScene(w,inherited,width,fontScale,channel),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${scene.width} ${scene.height}`);svg.setAttribute('class','widget-face');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${w.title||w.type} · synthetic example · inactive`);
 const make=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs)){n.setAttribute(k,String(v));if(k==='fill'||k==='stroke')n.style.setProperty(k,String(v));}return n;};svg.append(make('rect',{width:scene.width,height:scene.height,rx:S.metrics.radius,fill:scene.appearance.colors.surface,stroke:scene.appearance.colors.border}));
 for(const e of scene.elements){const color=scene.appearance.colors[e.role],stroke=e.stroke||1;let node;
  if(e.kind==='icon'){node=make('svg',{x:e.x,y:e.y,width:20,height:20,viewBox:'0 0 24 24'});node.append(make('path',{d:S.icons[e.type]||S.icons.value,fill:'none',stroke:color,'stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'}));}
  else if(e.kind==='text'){node=make('text',{x:e.x,y:e.y,fill:color,'font-size':e.size,'font-family':'sans-serif','text-anchor':e.align==='center'?'middle':e.align==='right'?'end':'start'});node.textContent=e.text;if(e.fullText)node.setAttribute('aria-label',e.fullText);}
  else if(e.kind==='rect')node=make('rect',{x:e.x,y:e.y,width:e.width,height:e.height,rx:e.rx||0,fill:color});
  else if(e.kind==='circle')node=make('circle',{cx:e.x,cy:e.y,r:e.r,fill:color});
  else if(e.kind==='line')node=make('line',{x1:e.x,y1:e.y,x2:e.x2,y2:e.y2,stroke:color,'stroke-width':stroke});
  else if(e.kind==='polyline')node=make('polyline',{points:e.points.map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-width':stroke,'stroke-linecap':'round','stroke-linejoin':'round'});
  if(node)svg.append(node);
 }return svg;
}
