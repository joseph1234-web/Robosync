import { sensorBoard } from './sensor-boards.js?v=0.36.1';
import { SUPABASE_URL, PUBLISHABLE_KEY } from './public-config.js?v=0.36.1';

export function supportsUsbSensor(device){
  return device?.config?.mode==='hardware'&&['ESP32','ESP32 DevKit V1'].includes(device.board_model);
}
export function usbSensorBinding(project,device,channel){
  const id=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
  if(!supportsUsbSensor(device)||!channel||channel.channel_key!=='pot_raw'||channel.value_type!=='number'||channel.direction!=='input'||channel.unit!=='raw'
    ||!id(project?.id)||!id(device.id)||!id(channel.id)||device.project_id!==project.id||channel.device_id!==device.id)return null;
  return {schema_version:1,backend_origin:SUPABASE_URL,publishable_key:PUBLISHABLE_KEY,project_id:project.id,device_id:device.id,channel_id:channel.id,channel_key:'pot_raw'};
}

export function sensorUsbBinding(project,device,channels){
 const p=sensorBoard(device?.board_model),id=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
 if(!p||device?.config?.mode!=='hardware'||!id(project?.id)||!id(device.id)||device.project_id!==project.id||!Array.isArray(channels))return null;
 const keys={pot_raw:['raw'],temperature:['C','°C'],humidity:['%'],light_raw:['raw']},streams={};
 for(const key of Object.keys(keys)){const matches=channels.filter(c=>c.channel_key===key&&c.device_id===device.id);if(matches.length>1)return null;if(!matches.length)continue;const c=matches[0];if(!id(c.id)||c.value_type!=='number'||c.direction!=='input'||!keys[key].includes(c.unit))return null;streams[key]={channel_id:c.id,unit:c.unit};}
 if(!streams.pot_raw||new Set(Object.values(streams).map(s=>s.channel_id)).size!==Object.keys(streams).length)return null;
 return {schema_version:2,backend_origin:SUPABASE_URL,publishable_key:PUBLISHABLE_KEY,project_id:project.id,device_id:device.id,board_profile:p.id,streams};
}
