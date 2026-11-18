/** Owner-scoped configuration metadata only. No readings, account tokens or private headers. */
const IO_KEYS=['version','kind','type','alias','min','max','step','precision','history','enum_values','driver','purpose','active_low','rgb_pins','measurement_key','operations','media_id','source_mode','formats','aspect_ratio','profile'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,JSON.parse(JSON.stringify(value[k]))]));
export function safeStudioMetadata(devices,channels,record,now=Date.now()){
  return{version:1,savedAt:now,devices:devices.map(d=>pick(d,['id','project_id','label','board_model'])),channels:channels.map(c=>({...pick(c,['id','device_id','title','channel_key','unit','value_type','direction']),config:{...pick(c.config,['physical_pin','virtual_pin','io_revision']),...(c.config?.io?{io:pick(c.config.io,IO_KEYS)}:{})}})),record:record?pick(record,['id','project_id','widget_type','revision','config']):null};
}
export function readStudioMetadata(storage,owner,project,now=Date.now()){
  try{const item=JSON.parse(storage.getItem('robosynct.studio.meta.'+owner+'.'+project)||'null');if(item?.version!==1||!Number.isFinite(item.savedAt)||item.savedAt>now+300000||now-item.savedAt>30*86400000||!Array.isArray(item.devices)||!Array.isArray(item.channels))return null;return item;}catch{return null;}
}
