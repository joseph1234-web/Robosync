import { applyBehavior,validateBehavior } from './widget-behavior.js?v=0.36.1';
import { applyWidgetSettings } from './widget-settings.js?v=0.37.0';
import { phoneOrder } from './phone-layout.js?v=0.37.0';
export { phoneLayout,phoneOrder,previewLayout } from './phone-layout.js?v=0.37.0';
import { streamMappingLabel } from './stream-mapping.js?v=0.36.1';
import { WIDGET_CONTRACT } from './widget-contract.js?v=0.36.1';
import { phoneColumns,compatibleWidget } from './io-widgets.js?v=0.37.0';
export const BOARDS=['esp32-devkit-v1','esp32-s3-devkitc-1','esp32-c3-devkitm-1','arduino-uno-r3','esp32-cam-ai-thinker'];
export function studioJob(kind,id,parent,base,payload,request=crypto.randomUUID()){return{p_request:request,p_kind:kind,p_id:id,p_parent:parent,p_base:base,p_payload:JSON.parse(JSON.stringify(payload))};}
export function layoutV4(config){if(config&&(![1,2,3,4].includes(config.schema_version)||config.kind!=='dashboard_layout'||!Array.isArray(config.widgets)||config.widgets.length>24))throw Error('Unsupported layout; existing configuration is retained.');return config?{...JSON.parse(JSON.stringify(config)),schema_version:4}:{kind:'dashboard_layout',schema_version:4,widgets:[],theme:'site',custom_phone_layout:false};}
export function widgetChoices(channel,device){return Object.keys(WIDGET_CONTRACT.widgets).filter(type=>compatibleWidget(type,channel,device));}
export function streamPayload(form,existing={}){const type=form.type,kind=form.kind,number=n=>n===''?undefined:Number(n),io={...(existing.config?.io||{}),version:1,kind,type,alias:form.alias||form.title,history:form.history!==false};for(const key of ['min','max','step','precision']){const value=number(form[key]??'');if(value!==undefined){if(!Number.isFinite(value))throw Error('Use finite '+key);io[key]=value;}else delete io[key];}if(form.default!==undefined&&form.default!=='')io.default=JSON.parse(form.default);if(type==='enum')io.enum_values=(form.choices||'').split('\n').filter(Boolean).map(line=>{const [value,...label]=line.split('=');return{value:value.trim(),label:(label.join('=')||value).trim()};});if(kind==='media'){io.media_id=existing.config?.io?.media_id||crypto.randomUUID();io.source_mode='snapshot';io.formats=['image/jpeg'];io.aspect_ratio=4/3;io.profile='esp32-cam-ai-thinker';}if(kind==='output'){if(type==='number'){io.min??=0;io.max??=form.driver==='servo'?180:255;io.step??=1;}io.driver=form.driver;if(form.driver==='digital'){if(!['true','false'].includes(String(form.polarity)))throw Error('Choose active HIGH or active LOW explicitly.');io.active_low=String(form.polarity)==='true';}else delete io.active_low;if(form.driver==='rgb'){io.rgb_pins=[form.physical,form.rgb_green,form.rgb_blue].map(p=>{if(!/^GPIO[0-9]{1,2}$/.test(p||''))throw Error('Choose all three RGB PWM pins.');return Number(p.slice(4));});}if(form.driver==='thermostat')io.measurement_key=form.measurement_key||'temperature';io.operations=type==='boolean'?['set','press','release','pulse']:['set'];}return{title:form.title,unit:form.unit||'',channel_key:existing.channel_key||form.key,value_type:['number','counter'].includes(type)?'number':type==='boolean'?'boolean':'text',direction:kind==='output'?'output':'input',config:{...(existing.config||{}),virtual_pin:form.virtual||'',physical_pin:form.physical||'',io}};}
export const CONTENT_WIDGETS=['note','heading','divider','panel'];
export function arrangePhone(config,id,{before,span,visible}={}){
  const next=layoutV4(config),item=next.widgets.find(w=>w.id===id);if(!item)throw Error('This widget is no longer in the draft.');
  const order=phoneOrder(next);if(before!==undefined){const at=order.findIndex(w=>w.id===id);order.splice(at,1);const target=before===null?order.length:order.findIndex(w=>w.id===before);if(target<0)throw Error('The drop target is no longer in the draft.');order.splice(target,0,item);}
  if(span!==undefined){if(![4,6,12].includes(span))throw Error('Choose a compact, half-row or full-row phone size.');item.phone={...item.phone,span};item.compact=span===4;}
  if(visible!==undefined){if(typeof visible!=='boolean')throw Error('Choose phone visibility.');item.phone={...item.phone,visible};}
  order.forEach((w,i)=>{w.phone={...w.phone,position:i};});next.custom_phone_layout=true;return next;
}
export function widgetDraft(existing,values,channels,devices){
  const next=JSON.parse(JSON.stringify(existing));const [type,id]=values.binding.split('|');
  if(!values.title?.trim()||values.title.trim().length>120)throw Error('Use a title of 1–120 characters.');
  if(type==='retained'){if(existing.type!=='camera'||existing.channel_id)throw Error('Choose a compatible source.');}
  else if(CONTENT_WIDGETS.includes(type)){next.type=type;next.note=values.note||'';delete next.device_id;delete next.channel_id;delete next.media_id;delete next.series;}
  else{
    const c=channels.find(c=>c.id===id),d=devices.find(d=>d.id===c?.device_id);if(!c||!d||!widgetChoices(c,d).includes(type))throw Error('Choose a compatible owned stream.');
    next.type=type;next.channel_id=c.id;next.device_id=c.device_id;
    if(type==='camera'){next.mode='protected';next.media_id=c.config.io.media_id;}
  }
  const span=Number(values.span),position=Number(values.position),height=Number(values.height||0);
  if(![4,6,12].includes(span)||!Number.isInteger(position)||position<0||position>23||!Number.isInteger(height)||height!==0&&(height<160||height>960))throw Error('Use a valid phone size, height and position.');
  if(!/^#[a-f0-9]{6}$/i.test(values.color)||!['left','center','right'].includes(values.align))throw Error('Choose a valid color and alignment.');
  if(!['inherit','mint','midnight','ocean','violet','sunrise','contrast'].includes(values.theme))throw Error('Choose a shared theme.');
  Object.assign(next,{title:values.title.trim(),theme:values.theme,phone:{...next.phone,span,position,height,visible:values.visible},compact:span===4,design:{...next.design},tab:values.tab?.trim()||''});
  for(const key of ['color','align'])if(values[key]!==((existing.design||{})[key]??(key==='color'?'#007f79':'left')))next.design[key]=values[key];
  for(const role of ['value','plot','meter','icon','title','track'])if(values['color_'+role]!==undefined){const color=values['color_'+role];if(color!==''&&!/^#[a-f0-9]{6}$/i.test(color))throw Error('Choose a valid '+role+' color.');next.design.colors={...next.design.colors};if(color)next.design.colors[role]=color;else delete next.design.colors[role];if(!Object.keys(next.design.colors).length)delete next.design.colors;}
  if(!existing.design&&!Object.keys(next.design).length)delete next.design;
  if(!CONTENT_WIDGETS.includes(next.type)&&type!=='retained'){
    const series=(values.series||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(series.length>5||new Set(series).size!==series.length||series.some(id=>!channels.some(c=>c.id===id&&c.direction==='input'&&c.value_type==='number')))throw Error('Choose up to five distinct numeric streams from this project.');
    next.series=series;next.aggregation=next.aggregation||'latest';
  }
  if(['gauge','progress','tank'].includes(next.type)){const min=Number(values.min),max=Number(values.max);if(values.min===''||values.max===''||!Number.isFinite(min)||!Number.isFinite(max)||min>=max)throw Error('Choose a real display range.');next.min=min;next.max=max;}
  applyBehavior(next,values,channels,values._widgets||[]);validateBehavior(next,channels,values._widgets||[]);return applyWidgetSettings(next,values,existing);
}
export function applyWidgetDraft(config,widget,{customize=false,position}={}){
  const next=layoutV4(config),before=next.widgets.find(w=>w.id===widget.id);
  if(!before&&next.widgets.length>=24)throw Error('This dashboard already has 24 widgets.');
  const draft=JSON.parse(JSON.stringify(widget));
  if(!customize&&(before||!config.custom_phone_layout)){
    if(before?.phone)draft.phone=JSON.parse(JSON.stringify(before.phone));else delete draft.phone;
    if(before?.compact!==undefined)draft.compact=before.compact;else delete draft.compact;
  }
  if(before)next.widgets=next.widgets.map(w=>w.id===draft.id?draft:w);else next.widgets.push(draft);
  if(customize||!before&&config.custom_phone_layout){
    const order=phoneOrder(config).filter(w=>w.id!==draft.id).map(w=>w.id),target=Math.max(0,Math.min(order.length,position??order.length));order.splice(target,0,draft.id);
    next.widgets=next.widgets.map(w=>{const original=config.widgets.find(x=>x.id===w.id);if(w.id!==draft.id&&!config.custom_phone_layout)w.phone={...w.phone,span:phoneColumns(w,390,1,false),visible:true,height:original?.size?.height||0};w.phone={...w.phone,position:order.indexOf(w.id)};return w;});next.custom_phone_layout=true;
  }
  return next;
}

/** Friendly labels only; stable IDs remain the persisted source binding. */
export function streamChoiceLabel(channel,devices=[]){return streamMappingLabel(channel,devices);}
export function numericSeriesChoices(channels,devices=[]){return channels.filter(c=>c.direction==='input'&&c.value_type==='number').slice().sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id)).map(c=>[c.id,streamChoiceLabel(c,devices)]);}

export function orderedSeriesSelection(previous,selected){const chosen=new Set(selected),retained=String(previous||'').split(',').filter(id=>chosen.has(id));return [...new Set([...retained,...selected])].join(',');}
