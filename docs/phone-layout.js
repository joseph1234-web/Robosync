import { panelParents } from './widget-behavior.js?v=0.36.1';
import { PHONE_LAYOUT_SPEC } from './phone-layout-spec.js?v=0.36.1';
import { phoneColumns } from './io-widgets.js?v=0.37.0';
export function phoneOrder(config){const widgets=config.widgets||[],index=new Map(widgets.map((w,i)=>[w.id,i]));return widgets.slice().sort((a,b)=>config.custom_phone_layout===true?(a.phone?.position??widgets.length)-(b.phone?.position??widgets.length)||index.get(a.id)-index.get(b.id):index.get(a.id)-index.get(b.id));}
export function phoneHeight(w,custom=false){const n=custom?w.phone?.height??w.size?.height:w.size?.height;return typeof n==='number'&&Number.isFinite(n)&&n>0?Math.max(PHONE_LAYOUT_SPEC.minHeight,Math.min(PHONE_LAYOUT_SPEC.maxHeight,Math.round(n))):0;}
export function phoneCardWidth(width,span){return Math.max(1,Math.round((width-2*PHONE_LAYOUT_SPEC.canvasInset+PHONE_LAYOUT_SPEC.gap)*span/12)-PHONE_LAYOUT_SPEC.gap);}
/** Pure projection: sort globally before filtering so unplaced/hidden cards retain stable order. */
export function phoneLayout(config,width=390,scale=1,{section='',visibleIds=null,showHidden=false}={}){
 const custom=config.custom_phone_layout===true,owners=panelParents(config.widgets||[]),all=new Map((config.widgets||[]).map(w=>[w.id,w])),slots=new Map(),result=[];
 const visible=w=>!(!showHidden&&custom&&w.phone?.visible===false)&&(!visibleIds||visibleIds.has(w.id));
 const eligible=phoneOrder(config).filter(w=>{const parent=all.get(owners.get(w.id));return visible(w)&&(!parent||visible(parent))&&(!section||(parent?parent.tab:w.tab)===section);}),eligibleIds=new Set(eligible.map(w=>w.id));
 for(const w of eligible){const parent=owners.get(w.id),target=parent&&eligibleIds.has(parent)?parent:'',slot=slots.get(target)||{row:0,column:0},span=phoneColumns(w,width,scale,custom);if(slot.column+span>12){slot.row++;slot.column=0;}result.push({id:w.id,...(target?{parent_id:target}:{}),row:slot.row,column:slot.column,span,height:phoneHeight(w,custom),cardWidth:phoneCardWidth(width,span)});slot.column+=span;if(slot.column===12){slot.row++;slot.column=0;}slots.set(target,slot);}

 return result;
}
export function previewLayout(config,width=390,scale=1,section=''){return phoneLayout(config,width,scale,{section}).map(p=>({...p,widget:config.widgets.find(w=>w.id===p.id)}));}
