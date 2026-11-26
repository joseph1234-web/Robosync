import { animateWidget } from './widget-motion.js?v=0.37.0';
import { controlReadiness,controlResult,authenticatedControlBoot,commandMatches,commandPresentation,reportedDelivery } from './control-state.js?v=3.0.0';
import { CONTROL_STATE_SPEC } from './control-state-spec.js?v=0.36.1';
import { streamDescriptor,negotiateStreamCapabilities,validateControlValue } from './stream-contract.js?v=0.36.1';
import { behavior,validateBehavior } from './widget-behavior.js?v=0.36.1';
import { executorReason,advancedKind,schedulePayload,thermostatPayload } from './advanced-controls.js?v=0.38.0';
import { mountRgbPicker,rgbHex } from './rgb-picker.js?v=3.0.1';
/** Foreground owner controls. Draft input is never sent by render, refresh or reconnect. */
export function renderOutputControl(w,{channel,device,request,canUse,active,client,channels=[channel],readings=()=>[],onDispose=()=>{},isOwner=canUse,isOnline=()=>globalThis.navigator?.onLine!==false,statusSource=null}){
 const box=document.createElement('div');box.className='io-control';
 const simpleSwitch=w.type==='switch';

 const fields=document.createElement('fieldset'),status=document.createElement('p');
 const details=document.createElement('details'),summary=document.createElement('summary');
 const help=document.createElement('p'),ackDetail=document.createElement('p'),contact=document.createElement('p'),upload=document.createElement('p'),feedback=document.createElement('p');
 const connection=document.createElement('p');
 fields.disabled=true;fields.setAttribute('aria-label',w.title);
 status.setAttribute('role','status');status.className='command-result';
 connection.setAttribute('data-control-connection','');connection.setAttribute('role','status');
 summary.textContent='Connection details';details.append(summary,help,contact,upload,ackDetail,feedback);
 box.append(connection);
 box.append(fields,status);
 if(!simpleSwitch)box.append(details);
 const setup=document.createElement('a');setup.textContent='Set up this board';setup.href='./studio.html?project='+encodeURIComponent(device.project_id||'')+'&tab=cloud&device='+encodeURIComponent(device.id);setup.hidden=true;box.append(setup);
 let lastConfirmedBoot=null,lastReport=null;let stopped=false,state,descriptor,poll,hold,holding=false,intent=0,ready=false,built=false,connectTimer,wasLive=true,checking=false,failed=false,lastCheck=0,sending=false;
 let rgbDraftDirty=false,rgbPicker=null,toggle=null,confirmedSwitch=null,commandAwaitingAck=false,lastReportedCommand='',reportInFlight='',confirmedAt=0,pendingRead=null,manualLookup=null,requestedHere=false;
 const live=()=>!stopped&&active()&&canUse()&&!document.hidden,b=behavior(w),rpc=(name,body)=>request('/rest/v1/rpc/'+name,{method:'POST',authenticated:true,body});
 const label=(name,node)=>{const row=document.createElement('label'),title=document.createElement('span');title.textContent=name;row.append(title,node);fields.append(row);return node;};
 const button=(name,fn)=>{const node=document.createElement('button');node.type='button';node.textContent=name;node.addEventListener('click',()=>{try{fn();}catch(e){status.textContent=e.message;}});fields.append(node);return node;};
 function valueInput(c,name=c.title){const io=c.config?.io||{};let node;if(io.type==='enum'){node=document.createElement('select');for(const option of io.enum_values||[]){const o=document.createElement('option');o.value=option.value;o.textContent=option.label;node.append(o);}}else if(io.type==='text'&&w.type==='entry'&&b.variant==='multiline'){node=document.createElement('textarea');node.rows=4;node.maxLength=512;}else{node=document.createElement('input');node.type=io.type==='boolean'?'checkbox':io.type==='text'?'text':'number';if(node.type==='text')node.maxLength=512;if(node.type==='number'){node.min=io.min??0;node.max=io.max??100;node.step=io.step??1;}}node.setAttribute('aria-label',name);label(name,node);return{node,read:()=>{if(io.type==='boolean')return node.checked;if(io.type==='number'){if(!node.value.trim())throw Error('Enter a number for '+name+' before Apply.');return Number(node.value);}return node.value;}};}
 function desc(c){return streamDescriptor(c,device,{capabilities:negotiateStreamCapabilities(state?.capabilities,device.board_model,true)});}
 function checkValue(c,value){validateControlValue(desc(c),value);return value;}

 function localTime(value) {
   const stamp=Date.parse(value);
   return Number.isFinite(stamp)?new Date(stamp).toLocaleString():null;
 }
 function progress(code,label,detail='') {
   status.dataset.phase=code;
   status.hidden=simpleSwitch&&['idle','applied'].includes(code);
   if(status.textContent!==label)status.textContent=label;
   ackDetail.textContent=detail;
 }
 function setSwitchSignal(signal) {
   if(!toggle)return;
   confirmedSwitch=typeof signal==='boolean'?signal:null;
   toggle.dataset.signal=signal==null?'unknown':signal?'on':'off';
   const name=channel.title||w.title;
   toggle.firstElementChild.textContent=signal==null?'—':signal?'ON':'OFF';
   if(signal==null){
     toggle.removeAttribute('role');toggle.removeAttribute('aria-checked');
     toggle.setAttribute('aria-label',name+' state unknown. Turn off');
   }else{
     toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(signal));
     toggle.setAttribute('aria-label',name);
   }
 }
 function confirm(ack,signal) {
   if(signal==null)return;
   const at=Date.parse(ack.result_at);
   if(Number.isFinite(at)&&at<confirmedAt)return;
   confirmedAt=Number.isFinite(at)?at:confirmedAt;
   feedback.textContent=ack.result?.feedback==null?'Physical feedback unavailable.':'Physical feedback: '+JSON.stringify(ack.result.feedback);
   if(simpleSwitch)setSwitchSignal(signal);
   if(rgbPicker){
     if(rgbHex(signal)===rgbPicker.value())rgbDraftDirty=false;
     if(!rgbDraftDirty)rgbPicker.setColor(signal);
   }
 }
 async function requestValue(value,operation='set',batch=null) {
   if(!live()||sending||!readiness().ready){updateConnection();return;}
   try{if(operation==='set'&&!batch)checkValue(channel,value);}catch(error){progress('rejected','Invalid request',error.message);return;}
   const token=++intent,boot=state.last_boot;
   sending=true;commandAwaitingAck=true;fields.disabled=true;clearTimeout(poll);pendingRead=manualLookup=null;requestedHere=true;
   rgbPicker?.setEnabled(false);
   progress('requested','Requesting command','Waiting for cloud acceptance.');
   function observe(receipts,accepted) {
     const bound=receipts.map((item,i)=>({id:item.id,device:device.id,channel:batch?batch[i].channel:channel.id,boot}));
     const until=Math.max(...receipts.map(item=>Date.parse(item.deadline)));
     if(!bound.length||!Number.isFinite(until)||receipts.some(item=>typeof item.id!=='string')||
        (accepted&&receipts.some((ack,i)=>!commandMatches(ack,bound[i]))))throw Error('Invalid command receipt.');
     let animated=false;
     async function read(useReceipt=false) {
       if(stopped||token!==intent)return;
       if(!live()){pendingRead=()=>read();return;}
       try {
         const acks=useReceipt?receipts:await Promise.all(bound.map(c=>client.status(c.id)));
         if(stopped||token!==intent)return;
         if(!live()){pendingRead=()=>read();return;}
         if(acks.some((ack,i)=>!commandMatches(ack,bound[i])||!['accepted','applied','rejected','expired'].includes(ack.state)))throw Error('Mismatched acknowledgment.');
         const states=acks.map(ack=>commandPresentation(ack,reportedDelivery(ack,state,descriptor.pin_id)));
         progress(states[0].code,states.map((item,i)=>(states.length>1?(i+1)+'. ':'')+item.label).join(' · '),
           states.map(item=>item.detail).filter((item,i,all)=>all.indexOf(item)===i).join(' '));
         const applied=acks.filter(ack=>ack.state==='applied');
         if(applied.length&&!animated){animated=true;animateWidget(box.closest?.('.dashboard-widget'),w.design?.icon||w.type);}
         if(acks.length===1&&applied.length){
           const ack=applied[0];
           confirm(ack,controlResult(ack,descriptor).signal);
         }
         if(acks.every(ack=>ack.state!=='accepted')){
           commandAwaitingAck=false;pendingRead=manualLookup=null;
           updateConnection();
           if(applied.length&&['schedule','thermostat'].includes(operation))watchReported(bound[0].id,operation==='schedule'?Date.parse(value.at)+5000:Date.now()+value.seconds*1000+5000,token);
           return;
         }
       }catch{
         if(stopped||token!==intent)return;
         progress('unconfirmed','ACK unconfirmed','Checking the existing request for a board acknowledgment.');
       }
       if(Date.now()<until+1000){poll=setTimeout(()=>read(),400);}
       else{
         commandAwaitingAck=false;pendingRead=null;
         progress('unconfirmed','ACK unconfirmed','Check the board to look up the command result.');
         manualLookup=()=>read();updateConnection();
       }
     }
     if(accepted)progress('accepted','Accepted by cloud','Waiting for the board.');
     // Start the read immediately. A receipt returned by an idempotent retry may already be final.
     void read(accepted&&receipts.every((row,i)=>commandMatches(row,bound[i])&&row.state!=='accepted'));
   }
   try{
     const receipt=batch?await client.sendBatch(batch,boot):await client.send(channel.id,boot,operation,value);
     if(stopped||token!==intent)return;
     observe(receipt.commands||[receipt],true);
   }catch(error){
     if(stopped||token!==intent)return;
     if(error.attempted?.length)try{observe(error.attempted,false);return;}catch{}
     commandAwaitingAck=false;
     const rejected=error.status>=400&&error.status<500;
     progress(rejected?'rejected':'unconfirmed',rejected?'Request rejected':'ACK unconfirmed',
       rejected?'Check the board connection and stream configuration before sending again.':'Cloud acceptance could not be confirmed.');
   }finally{sending=false;updateConnection();}
 }
 function watchReported(command,until,token){if(!live()||token!==intent||Date.now()>until)return;poll=setTimeout(async()=>{if(!live()||token!==intent)return;try{const report=await rpc('rs_io_device_status',{p_device:device.id});if(!live()||token!==intent)return;const output=report.reported?.outputs?.find(o=>o.command===command),contact=Date.parse(report.reported?.control_contact||report.last_contact),fresh=Number.isFinite(contact)&&Date.now()-contact<5000;if(output)ackDetail.textContent='Last board report'+(fresh?'':' · stale')+': '+output.phase+' · commanded signal '+JSON.stringify(output.applied)+' · physical feedback unavailable';if(!output||['armed','regulating'].includes(output.phase))watchReported(command,until,token);}catch{if(live()&&token===intent)ackDetail.textContent='Current board execution report unavailable · no action is replayed';}},1500);}
 const release=()=>{if(!holding)return;holding=false;intent++;clearInterval(hold);client.stop();status.textContent='Released · short board safety lease ends the held output';};
 function build({draft=false}={}){const type=w.type;fields.setAttribute('data-kind',type);const reason=draft?'':executorReason(w,channel,state);if(reason)throw Error(reason);validateBehavior(w,channels);if(type==='apply'||type==='slider'&&b.variant==='range'){const ids=type==='apply'?(b.fields||[channel.id]):[channel.id,b.secondary],items=ids.map(id=>{const c=channels.find(c=>c.id===id);if(!c||!desc(c).enabled)throw Error('Every field needs a matching authenticated writable stream.');return{c,input:valueInput(c,type==='slider'?(id===channel.id?'Lower limit':'Upper limit'):c.title)};});if(type==='slider')for(const item of items){const range=document.createElement('input');range.type='range';for(const key of ['min','max','step'])range[key]=item.input.node[key];range.setAttribute('aria-label',item.c.id===channel.id?'Lower range handle':'Upper range handle');range.value=item.input.node.min||'0';range.addEventListener('input',()=>item.input.node.value=range.value);item.input.node.addEventListener('input',()=>{if(item.input.node.value.trim()&&Number.isFinite(Number(item.input.node.value)))range.value=item.input.node.value;});label('Range handle',range);}button('Apply '+(type==='slider'?'range':'all fields'),()=>{const list=items.map(({c,input})=>({channel:c.id,value:checkValue(c,input.read())}));if(type==='slider'&&list[0].value>list[1].value)throw Error('Lower handle must not exceed upper handle.');requestValue(null,'set',list);});label('Result policy',document.createTextNode('Cloud acceptance is one transaction. Board results are shown per field; physical application is not atomic.'));}
 else if(type==='rgb'){
   rgbPicker=mountRgbPicker(value=>{rgbDraftDirty=true;void requestValue(value);});
   fields.append(rgbPicker.element);
 }
 else if(type==='schedule'){const input=valueInput(channel),date=document.createElement('input'),zone=document.createElement('input'),offset=document.createElement('input');date.type='datetime-local';date.step=60;zone.value=b.timezone||'Asia/Manila';offset.type='number';offset.min=-720;offset.max=840;offset.step=15;offset.value='480';label('Local date and time',date);label('IANA time zone',zone);label('UTC offset in minutes · selects repeated DST occurrence',offset);button('Arm one-shot schedule',()=>requestValue(schedulePayload(date.value,zone.value,Number(offset.value),checkValue(channel,input.read())),'schedule'));button('Cancel schedule + safe off',()=>requestValue(false,'cancel_schedule'));label('Execution policy',document.createTextNode('Board clock · once within 24 hours · RAM only for this boot · skip missed time and outages · fresh authenticated contact required.'));
 }
 else if(type==='thermostat'){const input=valueInput(channel,'Requested setpoint · °C'),measured=channels.find(c=>c.id===b.measured),rows=readings(b.measured),latest=rows.filter(r=>['ok','estimated'].includes(r.quality)&&Number.isFinite(r.value_num)).at(-1),p=document.createElement('p');p.textContent=latest?'Separate measured temperature: '+latest.value_num+' °C · '+latest.recorded_at:'Measured temperature: unavailable · never inferred from setpoint';fields.append(p);button('Start '+(b.seconds||30)+' second thermostat session',()=>requestValue(thermostatPayload(checkValue(channel,input.read()),b.seconds||30,measured?.channel_key),'thermostat'));button('Stop thermostat',()=>requestValue(false,'stop'));label('Safety policy',document.createTextNode('Heat-only signal · 0.5 °C hysteresis · stale/missing measurement, clock/contact loss or session expiry turns output off. No automatic renewal.'));}
 else if(type==='switch'){
   toggle=button('',()=>requestValue(confirmedSwitch===false));
   toggle.className='output-toggle';
   const text=document.createElement('span');
   text.setAttribute('aria-hidden','true');
   toggle.append(text);
   setSwitchSignal(null);
 }
 else if(type==='momentary'){const node=button('Hold',()=>{}),start=e=>{e.preventDefault();if(holding||fields.disabled)return;holding=true;if(e.pointerId!==undefined)node.setPointerCapture?.(e.pointerId);requestValue(true,'press');hold=setInterval(()=>live()?requestValue(true,'press'):release(),350);};node.addEventListener('pointerdown',start);for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])node.addEventListener(event,release);node.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)&&!e.repeat)start(e);});node.addEventListener('keyup',release);}
 else if(type==='pulse')button('Pulse · 250 ms',()=>requestValue(true,'pulse'));
 else {const input=valueInput(channel);if(['slider','knob'].includes(type)){const range=document.createElement('input');range.type='range';for(const key of ['min','max','step'])range[key]=input.node[key];range.setAttribute('aria-label',w.title+' requested value');range.value=input.node.min||'0';range.addEventListener('input',()=>input.node.value=range.value);input.node.addEventListener('input',()=>{if(input.node.value.trim()&&Number.isFinite(Number(input.node.value)))range.value=input.node.value;});label(type==='knob'?'Angle / requested value':'Requested slider value',range);}if(type==='stepper')for(const [name,delta]of [['−',-1],['+',1]])button(name,()=>{const bounds=descriptor.bounds,value=input.node.value.trim()?Number(input.node.value):bounds.min??0;input.node.value=String(Math.max(bounds.min??-1e12,Math.min(bounds.max??1e12,value+delta*(bounds.step??1))));});button(type==='console'?'Send allowlisted request':'Apply',()=>requestValue(input.read()));}
 built=true;ready=true;fields.disabled=false;progress('idle','No command yet');}
 function readiness(){return controlReadiness(w,channel,device,state,{owner:isOwner(),online:isOnline(),foreground:active()&&!document.hidden,failed});}
 function updateConnection(){
   if(stopped)return;
   const check=readiness();
   ready=check.ready;
   setup.hidden=check.code!=='firmware'||!isOwner();
   if(!ready&&holding)release();
   const locked=!ready||sending||!live()||simpleSwitch&&commandAwaitingAck;
   fields.disabled=locked;
   rgbPicker?.setEnabled(!locked);
   connection.hidden=simpleSwitch&&ready;
   if(connection.textContent!==check.label)connection.textContent=check.label;
   const stamp=Date.parse(lastReport?.reported?.control_contact);
   if(help.textContent!==check.detail)help.textContent=check.detail;
   contact.textContent='Last authenticated board poll · '+(Number.isFinite(stamp)?new Date(stamp).toLocaleString():'No report');
   upload.textContent='Last sensor upload · '+(localTime(lastReport?.last_upload)||'No report');
   connection.setAttribute('data-state',check.code);
   retry.hidden=(ready&&!manualLookup)||!live();
   return check;
 }
 const load=()=>statusSource?statusSource.read(device.id):rpc('rs_io_device_status',{p_device:device.id});
 // Reconcile only same-boot applied commands with the board's authenticated report.
 // Never treat a color draft, telemetry sample, expired command, or missing ACK as the board state.
 function syncReportedOutput(next){
  if(!live()||!built||commandAwaitingAck)return;
  let d;try{d=desc(channel);}catch{return;}
  const output=next.reported?.outputs?.find(o=>o.pin===d.pin_id);
  if(!output)return;
  const observed=controlResult({state:'applied',result:output},d).signal;
  if(!output.command){
    if(simpleSwitch&&confirmedSwitch===null&&typeof observed==='boolean')setSwitchSignal(observed);
    return;
  }
  if(output.command===lastReportedCommand||output.command===reportInFlight)return;
  const command=output.command,boot=next.last_boot;reportInFlight=command;
  client.status(command).then(ack=>{
   if(!live()||state?.last_boot!==boot||commandAwaitingAck)return;
   const current=state.reported?.outputs?.find(o=>o.pin===d.pin_id);
   if(current?.command!==command||ack?.state!=='applied'||!commandMatches(ack,{id:command,device:device.id,channel:channel.id,boot}))return;
   const confirmed=controlResult(ack,d).signal;
   const currentSignal=controlResult({state:'applied',result:{applied:current.applied}},d).signal;
   if(confirmed==null||JSON.stringify(confirmed)!==JSON.stringify(currentSignal))return;
   lastReportedCommand=command;
   confirm(ack,confirmed);
   if(!requestedHere){const info=commandPresentation(ack);progress(info.code,info.label,info.detail);}
  }).catch(()=>{}).finally(()=>{if(reportInFlight===command)reportInFlight='';});
 }
 async function checkBoard(){if(checking||!live())return;if(channel.direction==='input'){updateConnection();return;}checking=true;lastCheck=Date.now();try{const next=await load();if(!live())return;const priorBoot=lastConfirmedBoot,nextBoot=authenticatedControlBoot(next,device);if(priorBoot&&nextBoot&&nextBoot!==priorBoot){release();commandAwaitingAck=false;lastReportedCommand='';intent++;clearTimeout(poll);confirmedAt=0;pendingRead=manualLookup=null;requestedHere=false;setSwitchSignal(null);feedback.textContent='';progress('unconfirmed','Board restarted','Review the draft before requesting another change.');}if(nextBoot)lastConfirmedBoot=nextBoot;state=lastReport=next;failed=false;const check=updateConnection();if(check.ready){descriptor=desc(channel);if(!built){fields.replaceChildren();build();}syncReportedOutput(next);}updateConnection();}catch(error){if(!stopped&&live()){state=null;failed=true;updateConnection();}}finally{checking=false;}}
 const retry=document.createElement('button');retry.type='button';retry.textContent='Check board connection';retry.addEventListener('click',async()=>{retry.disabled=true;try{await checkBoard();if(manualLookup)manualLookup();}finally{retry.disabled=false;}});box.append(retry);
 const checkConnection=()=>{if(stopped)return;const current=live();if(!current){if(holding)release();}updateConnection();if(current&&pendingRead){const resume=pendingRead;pendingRead=null;resume();}
 if(current&&(!wasLive||Date.now()-lastCheck>=(failed?4500:CONTROL_STATE_SPEC.pollMs)))checkBoard();wasLive=current;clearTimeout(connectTimer);connectTimer=setTimeout(checkConnection,1000);};
 globalThis.addEventListener?.('online',checkConnection);globalThis.addEventListener?.('offline',checkConnection);document.addEventListener?.('visibilitychange',checkConnection);
 onDispose(()=>{stopped=true;clearTimeout(connectTimer);clearTimeout(poll);release();clearInterval(hold);globalThis.removeEventListener?.('online',checkConnection);globalThis.removeEventListener?.('offline',checkConnection);document.removeEventListener?.('visibilitychange',checkConnection);});
 if(['switch','rgb'].includes(w.type)){
   try{
     descriptor=desc(channel);
     if(descriptor.kind==='output'&&['boolean','rgb'].includes(descriptor.type))build({draft:true});
   }catch{}
 }
 updateConnection();checkBoard();connectTimer=setTimeout(checkConnection,1000);return box;
}
