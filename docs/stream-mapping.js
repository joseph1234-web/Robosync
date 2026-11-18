import { sensorBoard } from './sensor-boards.js?v=0.36.1';
import { physicalPinOptions } from './stream-pins.js?v=0.36.1';
import { IO_POLICY } from './io-policy.js?v=0.36.1';
import { ioBoardKey,ioPin } from './stream-contract.js?v=0.36.1';
export function mappingBoardName(board){return sensorBoard(board)?.name||(ioBoardKey(board)==='esp32-cam-ai-thinker'?'AI Thinker ESP32-CAM':board||'Board not set');}
export function streamMappingLabel(channel,devices=[]){const d=devices.find(d=>d.id===channel.device_id),cfg=channel.config||{},type=cfg.io?.type||channel.value_type;return[d?.label||'Device',mappingBoardName(d?.board_model),channel.title,cfg.virtual_pin?'Virtual '+cfg.virtual_pin:'Virtual pin not set',cfg.physical_pin?'Physical '+cfg.physical_pin:'Physical pin not set',type,channel.unit].filter(Boolean).join(' · ');}
const peers=(device,channels,editing)=>channels.filter(c=>c.device_id===device.id&&c.id!==editing.id);
export function physicalPinChoices(device,channels,editing={},values={}){
 const board=ioBoardKey(device.board_model),policy=IO_POLICY.boards[board],kind=values.kind||editing.config?.io?.kind||(editing.direction==='output'?'output':'sensor'),driver=values.driver||editing.config?.io?.driver||'digital',key=values.key||editing.channel_key,profile=sensorBoard(device.board_model),out=[{value:'',label:'No physical mapping',disabled:false}],same=editing.device_id===device.id,prior=same?editing.config?.physical_pin||'':'';
 let candidates=[];if(policy&&kind!=='media'){if(kind==='output')candidates=(policy[['pwm','rgb','servo'].includes(driver)?'pwm':'output']||[]).map(n=>board==='arduino-uno-r3'?(n>=14?'A'+(n-14):'D'+n):'GPIO'+n);else candidates=physicalPinOptions(profile?.id===4?'arduino-uno':device.board_model,{channel_key:key}).map(p=>p.value);}
 for(const value of [...new Set(candidates)]){const pin=ioPin(value);if(policy?.reserved.includes(pin)&&value!==prior)continue;const used=peers(device,channels,editing).filter(c=>{try{return (ioPin(c.config?.physical_pin)===pin||c.config?.io?.driver==='rgb'&&c.config.io.rgb_pins?.includes(pin))&&(kind==='output'||c.direction==='output');}catch{return false;}});out.push({value,label:value+(used.length?' · used by '+used.map(c=>c.title).join(', '):' · available wiring plan'),disabled:used.length>0&&value!==prior});}
 if(prior&&!out.some(p=>p.value===prior))out.push({value:prior,label:prior+' · retained mapping',disabled:false,retained:true});return out;
}
export function virtualPinChoices(device,channels,editing={},capabilities=null){
 const out=[{value:'',label:'No virtual label',disabled:false}],same=editing.device_id===device.id,prior=same?editing.config?.virtual_pin||'':'',max=capabilities?.virtual_pin_max;
 if(capabilities?.version===1&&Number.isInteger(max)&&max>=0&&max<=254)for(let n=0;n<=max;n++){const value='V'+n,used=peers(device,channels,editing).filter(c=>c.config?.virtual_pin===value);out.push({value,label:value+(used.length?' · used by '+used.map(c=>c.title).join(', '):' · available data label'),disabled:used.length>0&&value!==prior});}
 if(prior&&!out.some(p=>p.value===prior))out.push({value:prior,label:prior+' · retained label',disabled:false,retained:true});return out;
}
