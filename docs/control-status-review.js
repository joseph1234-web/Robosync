import { renderOutputControl } from './output-control-view.js?v=0.37.0';
import { createControlStatusSource } from './control-state.js?v=0.36.1';
import { WIDGET_DESIGN } from './widget-design.js?v=0.37.0';
import { animateWidget } from './widget-motion.js?v=0.37.0';
import { streamPreset } from './stream-presets.js?v=0.36.1';
const $=id=>document.getElementById(id),device={id:'22222222-2222-4222-8222-222222222222',board_model:'esp32-devkit-v1'},boot='0123456789abcdef',dispose=[],receipts=new Map();let count=0;
const preset=(kind,id,pin)=>{const c={...streamPreset(kind),id,device_id:device.id};c.config.physical_pin='GPIO'+pin;c.config.virtual_pin='V6';return c;},relay=preset('relay','33333333-3333-4333-8333-333333333333',25),servo=preset('servo','44444444-4444-4444-8444-444444444444',26),input=preset('button_input','55555555-5555-4555-8555-555555555555',14);
const rgb=preset('rgb','66666666-6666-4666-8666-666666666666',22);
rgb.config.virtual_pin='V8';rgb.config.io.rgb_pins=[22,21,19];
const statusSource=createControlStatusSource({load:async()=>{if($('mode').value==='failure')throw Error('Synthetic status failure');const now=Date.now();return{version:1,device_id:device.id,last_boot:boot,last_contact:new Date(now).toISOString(),reported:{control_contact:new Date(now-($('mode').value==='stale'?30000:0)).toISOString()},capabilities:$('mode').value==='firmware'?{}:{kind:'robosynct-io',version:1,board:device.board_model,virtual_pin_max:254,operations:['set','press','release','pulse'],outputs:[{pin:25,driver:'digital',operations:['set','press','release','pulse']},{pin:26,driver:'servo',operations:['set']},{pin:22,pins:[22,21,19],driver:'rgb',operations:['set']}],executors:{version:1,servo:true,rgb:true}}};}});
const client={send:async(channel,context,operation,value)=>{const id=crypto.randomUUID(),deadline=new Date(Date.now()+8000).toISOString();count++;$('count').textContent=count+' explicit request'+(count===1?'':'s');$('log').textContent='Synthetic '+operation+' '+JSON.stringify(value)+'\n'+$('log').textContent;receipts.set(id,{state:'applied',result:{phase:'value_applied',applied:value,feedback:null}});return{id,deadline};},status:async id=>receipts.get(id),stop:()=>{}};
function widgetIcon(type){
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
  icon.setAttribute('class','widget-icon');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  const path=document.createElementNS(icon.namespaceURI,'path');
  path.setAttribute('d',WIDGET_DESIGN.icons[type]);icon.append(path);
  return icon;
}
const samples=[1024,2458,3672,605,1885];
let sampleIndex=0;
$('gauge').querySelector('h2').prepend(widgetIcon('gauge'));
$('next-sample').addEventListener('click',()=>{
  sampleIndex=(sampleIndex+1)%samples.length;
  const value=samples[sampleIndex],formatted=value.toLocaleString();
  $('gauge-value').textContent=formatted;
  $('gauge-arc').setAttribute('stroke-dasharray',(value/4095*100)+' 100');
  $('gauge-face').setAttribute('aria-label','Potentiometer '+formatted+' of 4,095');
  $('sample-message').textContent='Simulated reading '+formatted+' raw';
  animateWidget($('gauge'),'gauge');
});
servo.config.virtual_pin='V5';input.config.virtual_pin='V3';
for(const [title,type,channel]of[['Relay','switch',relay],['RGB LED','rgb',rgb],['Servo angle','slider',servo],['Imported input binding','switch',input]]){
const card=document.createElement('article'),heading=document.createElement('h2');
card.className='card dashboard-widget';heading.textContent=title;
const pin=document.createElement('span');pin.className='widget-pin';pin.textContent=channel.config.virtual_pin;
heading.prepend(widgetIcon(type));heading.append(pin);
card.append(heading,renderOutputControl({id:channel.id,title,type,channel_id:channel.id},{channel,device,canUse:()=>$('mode').value!=='offline',isOwner:()=>true,isOnline:()=>$('mode').value!=='offline',active:()=>true,statusSource,request:()=>{throw Error('No real requests in review');},client,onDispose:f=>dispose.push(f)}));$('canvas').append(card);}
$('mode').addEventListener('change',()=>{statusSource.clear();globalThis.dispatchEvent(new Event('online'));});$('width').addEventListener('change',layout);$('reset').addEventListener('click',()=>{count=0;$('count').textContent='0 explicit requests';$('log').textContent='No commands sent.';});function layout(){const width=$('width').value;$('canvas').style.width=width==='full'?'100%':width+'px';$('canvas').classList.toggle('wide',width==='full');}layout();globalThis.addEventListener('pagehide',()=>dispose.forEach(f=>f()));
