import { SENSOR_BOARD_PROFILES,sensorBoard } from './sensor-boards.js?v=0.36.1';
import { THEME_IDS } from './themes.js?v=0.36.1';
import { normalizeWidgetSize } from './layout-gestures.js?v=0.36.1';
import { SENSOR_PRESETS, ESP32_MODULES, makeStreamDefinition } from './sensor-catalog.js?v=0.36.1';

const LIB_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIB_KEY=/^[a-z][a-z0-9_]{0,47}$/;
const LIB_TYPES=['value','gauge','chart','progress','text','status','led','table','note','heading','divider'];
const libCopy=value=>JSON.parse(JSON.stringify(value));
const libText=(value,max=120)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Enter a name of 1–'+max+' characters.');return value.trim();};
const libId=value=>{if(typeof value!=='string'||!(LIB_UUID.test(value)||/^builtin:[a-z0-9-]{1,60}$/.test(value)))throw new Error('Unsupported library identity.');return value;};
export function cleanChannelDefinition(value){
  if(!value||typeof value.channel_key!=='string'||!LIB_KEY.test(value.channel_key)||!['number','boolean','text'].includes(value.value_type)||value.direction!=='input'||typeof value.unit!=='string'||value.unit.length>24)throw new Error('A template needs valid, typed input streams.');
  const c=value.config||{},config={};
  if(value.value_type==='number'){
    if(!Number.isFinite(c.min)||!Number.isFinite(c.max)||c.min>=c.max||Math.max(Math.abs(c.min),Math.abs(c.max))>1e12)throw new Error('Numeric template ranges must be finite and increasing.');
    config.min=c.min;config.max=c.max;if(c.integer===true)config.integer=true;
  }
  if(value.value_type==='text'&&c.samples!==undefined){if(!Array.isArray(c.samples)||c.samples.length>12||c.samples.some(s=>typeof s!=='string'||s.length>200))throw new Error('Unsupported template text examples.');config.samples=[...c.samples];}
  return {channel_key:value.channel_key,title:libText(value.title),value_type:value.value_type,direction:'input',unit:value.unit,config};
}
export function cleanDeviceTemplate(value){
  if(!value||!Number.isInteger(value.version)||value.version<1||value.version>999||!Array.isArray(value.channels)||!value.channels.length||value.channels.length>16)throw new Error('A template version needs 1–16 streams.');
  const channels=value.channels.map(cleanChannelDefinition);if(new Set(channels.map(c=>c.channel_key)).size!==channels.length)throw new Error('Template stream keys must be unique.');
  const out={id:libId(value.id),version:value.version,name:libText(value.name),board_model:libText(value.board_model,80),channels};
  if(value.blueprint_ref!==undefined){const ref=value.blueprint_ref;if(!ref||!Number.isInteger(ref.version)||ref.version<1)throw new Error('Unsupported experiment blueprint version.');out.blueprint_ref={id:libId(ref.id),version:ref.version};}return out;
}
const libBuiltin=(id,name,keys)=>cleanDeviceTemplate({id:'builtin:'+id,version:1,name,board_model:'ESP32',channels:keys.map(k=>makeStreamDefinition(k))});
const sensorPack=libBuiltin('esp32-sensor-pack','ESP32 Pot + DHT + Light',['pot_raw','temperature','humidity','light_raw']);
sensorPack.channels.find(c=>c.channel_key==='light_raw').config={min:0,max:4095,integer:true};
sensorPack.blueprint_ref={id:'builtin:esp32-sensor-pack-overview',version:1};
const sensorExpansions=[];
for(const profile of SENSOR_BOARD_PROFILES){if(profile.id!==1){const pack=libBuiltin(profile.key+'-pack',profile.name+' Pot + DHT + Light',['pot_raw','temperature','humidity','light_raw']);pack.board_model=profile.name;for(const c of pack.channels)if(['pot_raw','light_raw'].includes(c.channel_key))c.config={min:0,max:(1<<profile.adc_bits)-1,integer:true};pack.blueprint_ref={id:'builtin:esp32-sensor-pack-overview',version:1};sensorExpansions.push(pack);}const temp=libBuiltin(profile.key+'-ds18b20',profile.name+' Pot + DS18B20',['pot_raw','temperature']);temp.board_model=profile.id===1?'ESP32':profile.name;temp.channels[0].config={min:0,max:(1<<profile.adc_bits)-1,integer:true};temp.channels[1].config={min:-55,max:125};temp.blueprint_ref={id:'builtin:ds18b20-overview',version:1};sensorExpansions.push(temp);}
export const BUILTIN_DEVICE_TEMPLATES=[libBuiltin('esp32-usb-pot','ESP32 USB potentiometer',['pot_raw']),...ESP32_MODULES.map(m=>libBuiltin('esp32-'+m.key,m.title,m.streams)),{...libBuiltin('esp32-dht-pot','ESP32 Potentiometer + DHT11 / DHT22',['pot_raw','temperature','humidity']),blueprint_ref:{id:'builtin:esp32-dht-pot-overview',version:1}},sensorPack,...sensorExpansions];
export const BUILTIN_BLUEPRINTS=[


  {id:'builtin:numeric-overview',version:1,name:'Numeric sensor overview',widgets:[{type:'value',title:'Latest reading',source_key:'$selected',value_type:'number',unit:'*',width:'half'},{type:'gauge',title:'Display range',source_key:'$selected',value_type:'number',unit:'*',width:'half',min:0,max:100},{type:'chart',title:'Reading history',source_key:'$selected',value_type:'number',unit:'*',width:'full'},{type:'table',title:'Recent samples',source_key:'$selected',value_type:'number',unit:'*',width:'full'}]},
  {id:'builtin:boolean-overview',version:1,name:'On/off sensor overview',widgets:[{type:'status',title:'Current status',source_key:'$selected',value_type:'boolean',unit:'*',width:'half',on_label:'On',off_label:'Off'},{type:'led',title:'Status indicator',source_key:'$selected',value_type:'boolean',unit:'*',width:'half',on_label:'On',off_label:'Off'},{type:'table',title:'Recent changes',source_key:'$selected',value_type:'boolean',unit:'*',width:'full'}]},
  {id:'builtin:text-overview',version:1,name:'Text stream overview',widgets:[{type:'text',title:'Latest message',source_key:'$selected',value_type:'text',unit:'*',width:'full'},{type:'table',title:'Message history',source_key:'$selected',value_type:'text',unit:'*',width:'full'}]},
  {id:'builtin:esp32-dht-pot-overview',version:1,name:'Potentiometer + DHT overview',widgets:[...['pot_raw','temperature','humidity'].flatMap((key,i)=>[{type:'value',title:['Potentiometer','Temperature','Humidity'][i],source_key:key,value_type:'number',unit:['raw','C','%'][i],width:'half'},{type:'chart',title:['Potentiometer history','Temperature history','Humidity history'][i],source_key:key,value_type:'number',unit:['raw','C','%'][i],width:'half'}])]},
  {id:'builtin:esp32-sensor-pack-overview',version:1,name:'Pot + DHT + Light overview',widgets:[...['pot_raw','temperature','humidity','light_raw'].flatMap((key,i)=>[{type:'value',title:['Potentiometer','Temperature','Humidity','Light (raw)'][i],source_key:key,value_type:'number',unit:['raw','C','%','raw'][i],width:'half'},{type:'chart',title:['Potentiometer history','Temperature history','Humidity history','Light history'][i],source_key:key,value_type:'number',unit:['raw','C','%','raw'][i],width:'half'}])]},
  {id:'builtin:ds18b20-overview',version:1,name:'Potentiometer + DS18B20 overview',widgets:['pot_raw','temperature'].flatMap((key,i)=>[{type:'value',title:i?'DS18B20 temperature':'Potentiometer',source_key:key,value_type:'number',unit:i?'C':'raw',width:'half'},{type:'chart',title:i?'Temperature history':'Potentiometer history',source_key:key,value_type:'number',unit:i?'C':'raw',width:'half'}])}
];
export function cleanBlueprint(value){
  if(!value||!Number.isInteger(value.version)||value.version<1||!Array.isArray(value.widgets)||!value.widgets.length||value.widgets.length>24)throw new Error('A blueprint needs 1–24 supported widgets.');
  const widgets=value.widgets.map(w=>{
    if(!w||!LIB_TYPES.includes(w.type))throw new Error('Sensor blueprints support data widgets, notes, headings and dividers. Camera widgets remain in your existing dashboard.');
    const out={type:w.type,title:libText(w.title),width:w.width==='full'?'full':'half'};
    if(w.size!==undefined)out.size=normalizeWidgetSize(w.size);
    if(w.theme!==undefined){if(!THEME_IDS.includes(w.theme))throw new Error('Unsupported blueprint theme.');out.theme=w.theme;}
    if(w.type==='note'){if(typeof w.note!=='string'||w.note.length>1000)throw new Error('Blueprint notes must fit 1,000 characters.');out.note=w.note;}
    else if(!['heading','divider'].includes(w.type)){
      if(typeof w.source_key!=='string'||!(LIB_KEY.test(w.source_key)||w.source_key==='$selected')||!['number','boolean','text'].includes(w.value_type)||typeof w.unit!=='string'||w.unit.length>24)throw new Error('Unsupported blueprint stream reference.');
      if(['value','gauge','chart','progress'].includes(w.type)&&w.value_type!=='number'||['status','led'].includes(w.type)&&w.value_type!=='boolean'||w.type==='text'&&w.value_type!=='text')throw new Error('Blueprint widget and stream types must match.');
      Object.assign(out,{source_key:w.source_key,value_type:w.value_type,unit:w.unit,aggregation:['latest','mean','min','max'].includes(w.aggregation)?w.aggregation:'latest'});
      if(['gauge','progress'].includes(w.type)){if(!Number.isFinite(w.min)||!Number.isFinite(w.max)||w.min>=w.max||!Number.isFinite(w.max-w.min))throw new Error('Unsupported blueprint display range.');out.min=w.min;out.max=w.max;}
      if(['status','led'].includes(w.type)){out.on_label=libText(w.on_label||'On',40);out.off_label=libText(w.off_label||'Off',40);}
    }
    return out;
  });return {id:libId(value.id),version:value.version,name:libText(value.name),widgets};
}
export function cleanDeviceGroup(value){
  if(!value||!LIB_UUID.test(value.id)||!['manual','dynamic'].includes(value.kind))throw new Error('Unsupported device group.');
  const out={id:value.id,name:libText(value.name),kind:value.kind,archived:value.archived===true};
  if(value.kind==='manual'){if(!Array.isArray(value.members)||value.members.length>200||value.members.some(id=>!LIB_UUID.test(id)))throw new Error('Choose up to 200 project devices.');out.members=[...new Set(value.members)];}
  else{const q=value.rule||{};if(!['all','simulation','hardware'].includes(q.mode)||typeof q.board_model!=='string'||q.board_model.length>80||typeof q.query!=='string'||q.query.length>100||typeof q.channel_key!=='string'||q.channel_key!==''&&!LIB_KEY.test(q.channel_key))throw new Error('Unsupported dynamic group rule.');out.rule={mode:q.mode,board_model:q.board_model,query:q.query,channel_key:q.channel_key};}
  return out;
}
export function emptyProjectLibrary(){return {kind:'project_library',schema_version:1,templates:[],blueprints:[],groups:[]};}
export function cleanProjectLibrary(value){
  if(!value||value.kind!=='project_library'||value.schema_version!==1||!Array.isArray(value.templates)||!Array.isArray(value.blueprints)||!Array.isArray(value.groups)||value.templates.length>60||value.blueprints.length>30||value.groups.length>30||JSON.stringify(value).length>128000)throw new Error('This project library format or size is unsupported. Its saved data has not been changed.');
  const out={...emptyProjectLibrary(),templates:value.templates.map(cleanDeviceTemplate),blueprints:value.blueprints.map(cleanBlueprint),groups:value.groups.map(cleanDeviceGroup)};
  for(const list of [out.templates.map(t=>t.id+'@'+t.version),out.blueprints.map(b=>b.id),out.groups.map(g=>g.id)])if(new Set(list).size!==list.length)throw new Error('The project library contains duplicate identities.');
  if([...out.templates,...out.blueprints].some(t=>!LIB_UUID.test(t.id)))throw new Error('Saved project items need their own identity.');
  return out;
}
export async function projectLibraryId(projectId){
  if(!LIB_UUID.test(projectId))throw new Error('Choose an existing project.');
  const ns=Uint8Array.from('6ba7b8119dad11d180b400c04fd430c8'.match(/../g),n=>parseInt(n,16)),name=new TextEncoder().encode('robosynct:project-library:v1:'+projectId.toLowerCase()),bytes=new Uint8Array(ns.length+name.length);bytes.set(ns);bytes.set(name,ns.length);
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-1',bytes)).slice(0,16);hash[6]=(hash[6]&15)|80;hash[8]=(hash[8]&63)|128;const s=[...hash].map(n=>n.toString(16).padStart(2,'0')).join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');
}
export function sameBoardFamily(a,b){const x=sensorBoard(a),y=sensorBoard(b);return a===b||!!x&&!!y&&x.id===y.id;}
export function templateChannelPlan(template,device,channels,projectId){
  const t=cleanDeviceTemplate(template);if(!device||device.project_id!==projectId||!LIB_UUID.test(device.id)||!sameBoardFamily(device.board_model,t.board_model))throw new Error('Choose a device in this project with the template’s board family.');
  return t.channels.map(def=>{const found=channels.filter(c=>c.device_id===device.id&&c.channel_key===def.channel_key);return {definition:def,existing:found[0]||null,status:!found.length?'add':found.length===1&&LIB_UUID.test(found[0].id)&&found[0].value_type===def.value_type&&found[0].direction===def.direction&&found[0].unit===def.unit?'reuse':'conflict'};});
}
export function matchingGroupDevices(group,devices,channels,projectId){
  const g=cleanDeviceGroup(group);if(g.archived)return [];
  return devices.filter(d=>d.project_id===projectId&&LIB_UUID.test(d.id)&&(g.kind==='manual'?g.members.includes(d.id):(g.rule.mode==='all'||(d.config?.mode==='simulation'?'simulation':'hardware')===g.rule.mode)&&(!g.rule.board_model||d.board_model===g.rule.board_model)&&(!g.rule.query||String(d.label).toLocaleLowerCase().includes(g.rule.query.toLocaleLowerCase()))&&(!g.rule.channel_key||channels.some(c=>c.device_id===d.id&&c.channel_key===g.rule.channel_key))));
}
export function captureSensorBlueprint(name,widgets,channels,deviceId){
  const selected=widgets.filter(w=>['note','heading','divider'].includes(w.type)||w.type!=='camera'&&w.device_id===deviceId);
  return cleanBlueprint({id:crypto.randomUUID(),version:1,name,widgets:selected.map(w=>{
    if(['note','heading','divider'].includes(w.type))return w;
    const c=channels.find(c=>c.id===w.channel_id&&c.device_id===w.device_id);if(!c)throw new Error('Refresh the dashboard sources before capturing a blueprint.');
    return {...w,source_key:c.channel_key,value_type:c.value_type,unit:c.unit||''};
  })});
}
export function instantiateBlueprint(blueprint,device,channels,projectId,primaryChannelId){
  const b=cleanBlueprint(blueprint);return b.widgets.map(w=>{
    const {source_key,value_type,unit,...rest}=w;const next={...rest,id:crypto.randomUUID()};
    if(source_key){
      if(!device||device.project_id!==projectId||!LIB_UUID.test(device.id))throw new Error('Choose a target device in this project.');
      const found=channels.filter(c=>c.device_id===device.id&&(source_key==='$selected'?c.id===primaryChannelId:c.channel_key===source_key));const c=found[0];
      if(found.length!==1||!LIB_UUID.test(c?.id)||c.value_type!==value_type||c.direction!=='input'||unit!=='*'&&(c.unit||'')!==unit)throw new Error('A required stream is missing or has a different type/unit: '+source_key+'. Add compatible streams first; existing bindings are kept.');
      next.device_id=device.id;next.channel_id=c.id;
      if(source_key==='$selected'&&['gauge','progress'].includes(w.type)){next.min=Number.isFinite(c.config?.min)?c.config.min:0;next.max=Number.isFinite(c.config?.max)&&c.config.max>next.min?c.config.max:next.min+100;}
    }
    return next;
  });
}
