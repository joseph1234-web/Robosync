import { controlPresets,streamPreset } from './stream-presets.js?v=0.36.1';
import { streamPayload } from './studio-model.js?v=0.37.0';
import { ioBoardKey,streamDescriptor,validateStreamSet } from './stream-contract.js?v=0.36.1';
import { physicalPinChoices,virtualPinChoices } from './stream-mapping.js?v=0.36.1';
export const CONTROL_BOARDS=['esp32-devkit-v1','esp32-s3-devkitc-1','esp32-c3-devkitm-1'];
export function controlPurposeChoices(widget='',board=''){return board&&!CONTROL_BOARDS.includes(ioBoardKey(board))?[]:controlPresets(widget);}
export function uniqueControlKey(purpose,channels,device){const root=streamPreset(purpose).channel_key,used=new Set(channels.filter(c=>c.device_id===device).map(c=>c.channel_key));let key=root;for(let n=2;used.has(key);n++)key=root+'_'+n;return key;}
export function controlStreamPayload(values,device,channels,capabilities=null){
 const preset=controlPurposeChoices('',device.board_model).find(p=>p.id===values.purpose);if(!preset)throw Error('Choose a supported ESP32 control purpose.');
 const seed=streamPreset(preset.id);seed.channel_key=values.key?.trim();
 if(!/^[a-z][a-z0-9_]{0,63}$/.test(seed.channel_key||''))throw Error('Use a stable firmware key with letters, numbers and underscores.');
 if(channels.some(c=>c.device_id===device.id&&c.channel_key===seed.channel_key))throw Error('That firmware key is already used. Keep the existing stream and choose a new key.');
 const form={...Object.fromEntries(['min','max','step','precision'].map(k=>[k,preset[k]??''])),...values,title:values.title?.trim(),alias:values.title?.trim(),kind:'output',type:preset.type,driver:preset.driver,unit:preset.unit};
 if(!form.title||form.title.length>120)throw Error('Enter a name of 1–120 characters.');
 for(const name of preset.driver==='rgb'?['physical','rgb_green','rgb_blue']:['physical']){
  if(!form[name]||!physicalPinChoices(device,channels,{}, {kind:'output',driver:preset.driver==='rgb'?'pwm':preset.driver}).some(p=>p.value===form[name]&&!p.disabled))throw Error('Choose free physical output pins. Existing inputs and reserved pins are kept.');
 }
 if(form.virtual&&!virtualPinChoices(device,channels,{},capabilities).some(p=>p.value===form.virtual&&!p.disabled))throw Error('Choose an unused label within the authenticated range, or leave the virtual label unassigned.');
 const payload=streamPayload(form,seed),row={...payload,id:values.id,device_id:device.id};
 streamDescriptor(row,device);validateStreamSet([...channels.filter(c=>c.device_id===device.id),row],device);return payload;
}
