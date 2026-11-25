import { WIDGET_CONTRACT } from './widget-contract.js?v=0.36.1';
import { WIDGET_LIBRARY_CATALOG } from './widget-library-catalog.js?v=3.0.0';
import { WIDGET_DESIGN } from './widget-design.js?v=0.37.0';
import { compatibleWidget, CONTROL_TYPES } from './io-widgets.js?v=3.0.0';
/** Shared discoverable inventory. Availability describes layout placement, never physical execution. */
export const WIDGET_LIBRARY_GROUPS=WIDGET_LIBRARY_CATALOG.categories;
export function widgetLibraryGroup(type){return WIDGET_LIBRARY_CATALOG.widgets[type]?.group||'Advanced';}
export function widgetSupportsStream(type, channel, device) {
  if (!compatibleWidget(type,channel,device)) return false;
  if (!CONTROL_TYPES.includes(type)) return true;
  const required=type==='momentary'?['press','release']:[WIDGET_CONTRACT.widgets[type].operation];
  return required.every(operation=>channel.config?.io?.operations?.includes(operation));
}

export function widgetLibraryInventory(channels=[],devices=[],{projectId='',allowGenericCamera=true}={}) {
  const scoped=new Map(devices.filter(device=>!projectId||device.project_id===projectId).map(device=>[device.id,device]));
  return Object.keys(WIDGET_DESIGN.labels).map(type=>{
    const metadata=WIDGET_LIBRARY_CATALOG.widgets[type],group=widgetLibraryGroup(type);
    const content=group==='Layout';
    const sources=channels.filter(channel=>scoped.has(channel.device_id)&&widgetSupportsStream(type,channel,scoped.get(channel.device_id)));
    const enabled=content||(type==='camera'&&allowGenericCamera)||sources.length>0;
    const rule=WIDGET_CONTRACT.widgets[type];
    let reason=metadata?.description||'';
    if(content)reason='No datastream required.';
    else if(!enabled)reason=group==='Controls'
      ?'Choose a writable '+rule.types.join(' / ')+' stream that supports '+rule.operation+'.'
      :'Add a compatible '+(type==='camera'?'media':'input')+' stream.';
    else if(!reason)reason=sources.length+(sources.length===1?' compatible stream.':' compatible streams.');
    return {
      type,label:metadata?.label||WIDGET_DESIGN.labels[type],group,sources,enabled,reason,gated:false,
      search:sources.map(channel=>[channel.title,channel.channel_key,channel.config?.virtual_pin,channel.config?.physical_pin,scoped.get(channel.device_id)?.label].join(' ')).join(' ')
    };
  });
}

export function filterWidgetLibrary(items,category='All',search=''){
  const words=String(search).toLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(item=>{
    const indexed=[item.label,item.type,item.group,item.reason,item.search].join(' ').toLowerCase();
    return (category==='All'||item.group===category)&&words.every(word=>indexed.includes(word));
  });
}

export function widgetLibraryPreview(item) {
  const root=document.createElement('span');root.className='palette-preview';
  root.setAttribute('aria-hidden','true');
  root.dataset.preview=item.type;
  if(['value','text','note','heading'].includes(item.type)){
    root.textContent={value:'24.8',text:'Aa',note:'Aa',heading:'Aa'}[item.type];
  }else{
    const pieces=item.type==='rgb'?3:['chart','bar','multi'].includes(item.type)?6:1;
    for(let i=0;i<pieces;i++)root.append(document.createElement('i'));
  }
  return root;
}
export function librarySeriesOrder(previous,selected){const chosen=new Set(selected);return [...new Set([...(previous||[]).filter(id=>chosen.has(id)),...selected])];}
