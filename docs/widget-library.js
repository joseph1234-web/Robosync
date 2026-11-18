import { WIDGET_CONTRACT } from './widget-contract.js?v=0.36.1';
import { WIDGET_LIBRARY_CATALOG } from './widget-library-catalog.js?v=0.36.1';
import { WIDGET_DESIGN } from './widget-design.js?v=0.37.0';
import { compatibleWidget, CONTROL_TYPES } from './io-widgets.js?v=0.37.0';
/** Shared discoverable inventory. Availability describes layout placement, never physical execution. */
export const WIDGET_LIBRARY_GROUPS=WIDGET_LIBRARY_CATALOG.categories;
export function widgetLibraryGroup(type){return WIDGET_LIBRARY_CATALOG.widgets[type]?.group||'Display';}
export function widgetLibraryInventory(channels=[],devices=[],{projectId='',allowGenericCamera=true}={}){
 const scoped=devices.filter(d=>!projectId||d.project_id===projectId),allowed=new Set(scoped.map(d=>d.id));
 return Object.keys(WIDGET_DESIGN.labels).map(type=>{const group=widgetLibraryGroup(type),content=group==='Layout',gated=false,sources=channels.filter(c=>allowed.has(c.device_id)&&compatibleWidget(type,c,scoped.find(d=>d.id===c.device_id))&&(!CONTROL_TYPES.includes(type)||c.config?.io?.operations?.includes(WIDGET_CONTRACT.widgets[type].operation))),enabled=!gated&&(content||type==='camera'&&allowGenericCamera||sources.length>0);let reason;
  if(gated)reason='Requires a separately supported executor; unavailable in this release.';
  else if(content)reason='No stream required.';
  else if(type==='camera'&&!allowGenericCamera&&!sources.length)reason='Create a typed camera/media stream for this source first.';
  else if(type==='camera')reason=sources.length?'Protected media streams and retained local/generic sources.':'Retained local/generic sources; add a typed media stream for ESP32-CAM.';
  else if(!sources.length)reason=group==='Controls'?(['switch','momentary','pulse'].includes(type)?'Choose or create a Boolean output for the LED or relay this button controls.':'Needs a compatible writable '+WIDGET_CONTRACT.widgets[type].types.join(' / ')+' stream supporting '+WIDGET_CONTRACT.widgets[type].operation+'.'):type==='compass'?'Needs an input stream measured in degrees.':'Needs a compatible input stream ('+({'text':'text / enum','status':'boolean','led':'boolean','health':'boolean / text / enum','alarm':'boolean / enum','vector':'vector','gps':'location','heatmap':'matrix','timeline':'number / boolean / text / enum'}[type]||'numeric')+').';
  else if(type==='led')reason='Read-only indicator. Use the On/Off button to control an LED or relay.';
  else reason=(WIDGET_LIBRARY_CATALOG.widgets[type]?.description?WIDGET_LIBRARY_CATALOG.widgets[type].description+' ':'')+sources.length+' compatible '+(sources.length===1?'stream.':'streams.')+(group==='Controls'?' Execution requires matching authenticated output firmware.':'');
  return{type,label:WIDGET_LIBRARY_CATALOG.widgets[type]?.label||WIDGET_DESIGN.labels[type],group,sources,enabled,reason,gated};
 });
}
export function filterWidgetLibrary(items,category='All',search=''){const query=String(search).toLowerCase().trim();return items.filter(i=>(category==='All'||i.group===category)&&(!query||[i.label,i.type,i.group,i.reason,...i.sources.map(c=>c.title)].join(' ').toLowerCase().includes(query)));}
export function librarySeriesOrder(previous,selected){const chosen=new Set(selected);return [...new Set([...(previous||[]).filter(id=>chosen.has(id)),...selected])];}
