import { CONTROL_STATE_SPEC } from './control-state-spec.js?v=0.36.1';
import { WIDGET_CONTRACT } from './widget-contract.js?v=0.36.1';
import { streamDescriptor,negotiateStreamCapabilities,validateControlValue } from './stream-contract.js?v=0.36.1';
import { advancedKind,executorReason } from './advanced-controls.js?v=0.36.1';
/** A telemetry backlog can cross boots; only fresh authenticated control contact identifies a controller session. */
export function authenticatedControlBoot(state,device,now=Date.now()){
 try{
 if(state?.version!==1||state.device_id!==device?.id||!device||!/^[a-f0-9]{16}$/.test(state.last_boot||''))return null;
 const cap=negotiateStreamCapabilities(state.capabilities,device.board_model,true);
 if(cap.version!==1||!cap.outputs.length)return null;
 for(const time of [Date.parse(state.last_contact),Date.parse(state.reported?.control_contact)])if(!Number.isFinite(time)||time>now+CONTROL_STATE_SPEC.clockToleranceMs||now-time>=CONTROL_STATE_SPEC.scalarFreshMs)return null;
 return state.last_boot;
 }catch{return null;}
}
export function controlReadiness(w,channel,device,state,{owner=true,online=true,foreground=true,now=Date.now(),failed=false}={}){
 const result=(code,expires=0,detail=CONTROL_STATE_SPEC.states[code][1])=>({version:1,code,ready:code==='ready',label:CONTROL_STATE_SPEC.states[code][0],detail,expires_at:expires});
 if(!owner)return result('owner');if(!online)return result('offline');if(!foreground)return result('background');
 if(channel?.direction==='input')return result('input');
 if(!state)return result(failed?'unavailable':'checking');
 try{
  if(state.version!==1||state.device_id!==device?.id)return result('binding');
  const d=streamDescriptor(channel,device,{capabilities:negotiateStreamCapabilities(state.capabilities,device.board_model,true)}),rule=WIDGET_CONTRACT.widgets[w.type];
  if(!rule||rule.direction!==d.direction||!rule.types.includes(d.type)||rule.drivers&&!rule.drivers.includes(channel.config?.io?.driver))return result('binding');
  if(!d.enabled)return result('firmware');
  const reason=executorReason(w,channel,state);if(reason)return result('operation',0,reason);
  const operations=w.type==='momentary'?['press','release']:w.type==='pulse'?['pulse']:['set'];
  if(operations.some(op=>!d.operations.includes(op)))return result('operation');
  const window=advancedKind(w)?CONTROL_STATE_SPEC.executorFreshMs:CONTROL_STATE_SPEC.scalarFreshMs,contact=Date.parse(state.reported?.control_contact),last=Date.parse(state.last_contact);
  if(!/^[a-f0-9]{16}$/.test(state.last_boot||'')||![contact,last].every(t=>Number.isFinite(t)&&t<=now+CONTROL_STATE_SPEC.clockToleranceMs&&now-t<window))return result('stale');
  return result('ready',Math.min(contact,last)+window);
 }catch{return result('binding');}
}
/** ACK signal is commanded state, never physical feedback or a telemetry sample. */
export function controlResult(ack,descriptor){
 const state=ack?.state||'unconfirmed',r=ack?.result||{};let signal=null;
 if(state==='applied'&&['','applied','value_applied','fired'].includes(r.phase||'')){
  let value=r.applied;if(descriptor?.type!=='rgb'&&Array.isArray(value))value=value[0];
  if(descriptor?.type==='boolean'&&(value===0||value===1))value=value===1;
  try{validateControlValue(descriptor,value);signal=value;}catch{}
 }
 return {state,signal,feedback:state==='applied'&&r.feedback!=null?r.feedback:null};
}
export function commandMatches(ack, expected) {
  return !!ack && ack.id === expected.id && ack.device_id === expected.device &&
    ack.channel_id === expected.channel && ack.boot === expected.boot;
}

// Polling a device alone is not proof that this particular command reached it.
export function reportedDelivery(command, state, pin) {
  return !!command?.id && state?.device_id === command.device_id &&
    state.last_boot === command.boot && Number.isFinite(Date.parse(state.reported?.control_contact)) &&
    state.reported?.outputs?.some(output => output.pin === pin && output.command === command.id) === true;
}

export function commandPresentation(ack, received = false) {
  switch (ack?.state) {
    case 'accepted': return received
      ? {code:'sent', label:'Received by board', detail:'The board reported this command. Its acknowledgment is pending.'}
      : {code:'accepted', label:'Accepted by cloud', detail:'Waiting for the board to receive this command.'};
    case 'applied':
      if (ack.result?.phase === 'armed') return {code:'applied', label:'Schedule armed', detail:'The board acknowledged the schedule. Execution has a separate report.'};
      if (ack.result?.phase === 'regulating') return {code:'applied', label:'Setpoint acknowledged', detail:'The board accepted the setpoint. Temperature comes from the sensor.'};
      return {code:'applied', label:'Applied and acknowledged', detail:'The board confirmed the output signal.'};
    case 'rejected': return {code:'rejected', label:'Rejected', detail:'The board or cloud rejected this command. Check its output configuration.'};
    case 'expired': return {code:'expired', label:'Expired', detail:ack.result?.state === 'applied'
      ? 'The board reported application after the deadline. Verify the physical output before requesting another change.'
      : 'The command expired before confirmation. A new request requires another press.'};
    default: return {code:'unconfirmed', label:'ACK unconfirmed', detail:'A matching acknowledgment is unavailable.'};
  }
}

/** A dashboard owns this cache. Generation checks prevent account-crossing replies. */
export function createControlStatusSource({load,generation=()=>'',now=Date.now,ttl=750}){
 const entries=new Map();let epoch=0;
 return {clear(){epoch++;entries.clear();},async read(device){
  const g=generation(),key=g+':'+device,time=now(),old=entries.get(key);if(old&&(old.promise||time>=old.at&&time-old.at<ttl))return old.promise?old.promise.then(v=>structuredClone(v)):structuredClone(old.value);
  const e={at:time},n=epoch;e.promise=Promise.resolve().then(()=>load(device)).then(value=>{if(n!==epoch||generation()!==g){if(entries.get(key)===e)entries.delete(key);throw Error('Account or dashboard changed.');}e.value=structuredClone(value);e.at=now();delete e.promise;return structuredClone(value);},error=>{if(entries.get(key)===e)entries.delete(key);throw error;});
  entries.set(key,e);if(entries.size>32)entries.delete(entries.keys().next().value);return e.promise.then(v=>structuredClone(v));
 }};
}
