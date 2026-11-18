import { sensorBoard,sensorPinName } from './sensor-boards.js?v=0.36.1';
// Wiring plans and logical data aliases; these settings do not reprogram a board.
export function boardPinProfile(board){
  if(['ESP32','ESP32 DevKit V1','esp32-devkit-v1'].includes(board))return 'esp32';
  const supported=sensorBoard(board);if(supported&&supported.id!==1&&supported.id!==4)return supported.key;
  if(supported?.id===4||['Arduino Uno','Arduino Uno R3','arduino-uno','arduino-uno-r3'].includes(board))return 'uno';
  return '';
}
export function physicalPinOptions(board,channel={}){
  const profile=boardPinProfile(board),analog=['pot_raw','light_raw'].includes(channel.channel_key);
  const supported=sensorBoard(board);if(supported&&[2,3].includes(supported.id))return (analog?supported.analog:supported.digital).map(n=>({value:'GPIO'+n,label:'GPIO'+n+(analog?' · ADC1':'')}));
  if(profile==='esp32')return (analog?[32,33,34,35,36,39]:[4,13,14,16,17,18,19,21,22,23,25,26,27,32,33,34,35,36,39]).map(n=>({value:'GPIO'+n,label:'GPIO'+n+(n>=34?' · input only':'')+(analog?' · ADC1':'')}));
  if(profile==='uno')return (analog?['A0','A1','A2','A3','A4','A5']:[...Array.from({length:12},(_,n)=>'D'+(n+2)),'A0','A1','A2','A3','A4','A5']).map(value=>({value,label:value+(value[0]==='A'?' · analog input':'')}));
  return [];
}
export function normalizePinMapping(value,board,channel={}){
  const physical_pin=String(value?.physical_pin||'').trim().toUpperCase(),virtual_pin=String(value?.virtual_pin||'').trim().toUpperCase();
  if(physical_pin&&!physicalPinOptions(board,channel).some(p=>p.value===physical_pin))throw new Error('Choose a supported physical input pin for this board and stream.');
  if(virtual_pin&&(!/^V(0|[1-9]\d{0,2})$/.test(virtual_pin)||Number(virtual_pin.slice(1))>255))throw new Error('Use a virtual data label from V0 to V255, or leave it blank.');
  return {...(physical_pin?{physical_pin}:{}),...(virtual_pin?{virtual_pin}:{})};
}
export function applyPinMapping(config,mapping){const next={...(config||{})};for(const key of ['physical_pin','virtual_pin']){if(mapping[key])next[key]=mapping[key];else delete next[key];}return next;}
export function samePinConfig(a,b){const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;return JSON.stringify(stable(a||{}))===JSON.stringify(stable(b||{}));}
export function pinSummary(channel){const c=channel?.config||{},parts=[];if(/^V(0|[1-9]\d{0,2})$/.test(c.virtual_pin||'')&&Number(c.virtual_pin.slice(1))<=255)parts.push(c.virtual_pin+' data label');if(c.io?.driver==='rgb'&&Array.isArray(c.io.rgb_pins)&&c.io.rgb_pins.length===3&&c.io.rgb_pins.every(n=>Number.isInteger(n)&&n>=0&&n<=48))parts.push('R/G/B '+c.io.rgb_pins.map(n=>'GPIO'+n).join(' / ')+' wiring plan');else if(/^(GPIO\d{1,2}|A[0-5]|D\d{1,2})$/.test(c.physical_pin||''))parts.push(c.physical_pin+' wiring plan');return parts.join(' · ');}
export function pinCode(board,channel,mapping){
  if(!mapping.physical_pin)return 'Choose a physical pin to see the matching code reference.';
  const p=boardPinProfile(board),pin=mapping.physical_pin,constant=p!=='uno'?pin.slice(4):pin[0]==='D'?pin.slice(1):pin;
  return '// '+(p!=='uno'?(sensorBoard(board)?.name||'ESP32'):'Arduino Uno')+' code reference — review in your compatible sketch\nconstexpr uint8_t SENSOR_PIN = '+constant+';\n'+(['pot_raw','light_raw'].includes(channel?.channel_key)?'// Read with analogRead(SENSOR_PIN); select an analog-capable input.':'// Use the appropriate sensor library or digitalRead(SENSOR_PIN).')+'\n'+(mapping.virtual_pin?'// '+mapping.virtual_pin+' is a RoboSynct data label, not a physical pin.\n':'')+'// This does not upload or alter firmware.';
}
