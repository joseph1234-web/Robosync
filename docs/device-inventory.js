import { authenticatedControlBoot } from './control-state.js?v=3.0.0';
import { displayStreamNumber, streamValue, validStreamReadings } from './sensor-catalog.js?v=0.36.1';

const count = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
const timestamp = (value, now) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now + 2000 ? value : null;
const version = value => typeof value === 'string' && /^v?\d+(?:\.\d+){1,3}(?:[-+][\w.-]{1,24})?$/.test(value) ? value : null;
const uuid = value => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
export const inventoryDate = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : 'Not reported';

export function deviceReport(device, response, now=Date.now()){
  const state = response?.version === 1 && response.device_id === device.id ? response : null;
  const report = state?.reported || {}, upload = report.upload;
  const lastUpload = timestamp(state?.last_upload,now), controlContact = timestamp(report.control_contact,now);
  const contact = timestamp(state?.last_contact,now);
  const latest = Math.max(...[lastUpload, controlContact, contact].filter(Boolean).map(Date.parse));
  const age = now - latest;
  const status = device.config?.mode === 'simulation' ? 'simulation' : !Number.isFinite(latest) ? 'unknown' : age <= 60_000 ? 'online' : age <= 300_000 ? 'stale' : 'offline';
  return {
    id:device.id, status, lastUpload, controlContact, controlOnline:!!authenticatedControlBoot(state, device, now),
    backlog:upload ? count(state.backlog) : null,
    firmware:version(report.firmware) || version(state?.capabilities?.firmware),
    rssi:Number.isInteger(report.rssi_dbm) && report.rssi_dbm >= -127 && report.rssi_dbm <= 0 ? report.rssi_dbm : null,
    wifiConnected:typeof report.wifi_connected === 'boolean' ? report.wifi_connected : null,
    http:Number.isInteger(upload?.previous_http_code) && upload.previous_http_code >= -100 && upload.previous_http_code <= 599 ? upload.previous_http_code : null,
    lost:count(upload?.dropped_newest), heap:count(report.heap_free), tls:Number.isInteger(report.tls_code) ? report.tls_code : null,
    clock:typeof upload?.clock_valid==='boolean'?upload.clock_valid:null,
    lastAck:timestamp(report.last_ack,now), pending:count(report.pending_commands),
    expired:count(report.expired_commands), rejected:count(report.rejected_commands)
  };
}

// Only the limited fields consumed by this view cross into its cache. The owner status also contains enrollment metadata.
export function cleanReport(device, response){
  if(response?.device_id !== device.id || response.version !== 1) return null;
  const r=response.reported || {}, u=r.upload, cap=response.capabilities;
  return {version:1,device_id:device.id,last_contact:response.last_contact,last_upload:response.last_upload,last_boot:response.last_boot,
    backlog:response.backlog,capabilities:cap?.kind === 'robosynct-io' ? {
      kind:cap.kind, version:cap.version, board:cap.board, virtual_pin_max:cap.virtual_pin_max, operations:cap.operations, firmware:version(cap.firmware),executors:cap.executors?.version===1?{version:1,servo:cap.executors.servo===true}:null,
      outputs:Array.isArray(cap.outputs)?cap.outputs.slice(0,16).map(o=>({pin:o?.pin,driver:o?.driver,pins:o?.pins,operations:o?.operations,active_low:o?.active_low})):[]}:null,
    reported:{control_contact:r.control_contact,firmware:version(r.firmware),rssi_dbm:r.rssi_dbm,wifi_connected:r.wifi_connected,heap_free:r.heap_free,tls_code:r.tls_code,
      last_ack:r.last_ack,pending_commands:r.pending_commands,expired_commands:r.expired_commands,rejected_commands:r.rejected_commands,
      upload:u && typeof u==='object'?{previous_http_code:u.previous_http_code,dropped_newest:u.dropped_newest,clock_valid:u.clock_valid}:null,
      outputs:Array.isArray(r.outputs)?r.outputs.filter(o=>uuid(o?.command) && Number.isInteger(o.pin)).slice(0,16).map(({pin,command,applied})=>({pin,command,applied})):[]}};
}

export function streamFacts(channel){
  const config=channel.config||{}, io=config.io||{};
  const virtual=/^V(?:0|[1-9]\d{0,2})$/.test(config.virtual_pin||'') && Number(config.virtual_pin.slice(1)) <=255 ? config.virtual_pin : null;
  let physical=/^(?:GPIO\d{1,2}|A[0-5]|D\d{1,2})$/.test(config.physical_pin||'') ? config.physical_pin : null;
  if(io.driver==='rgb' && Array.isArray(io.rgb_pins) && io.rgb_pins.length===3 && io.rgb_pins.every(p=>Number.isInteger(p)&&p>=0&&p<=48))
    physical=io.rgb_pins.map(p=>'GPIO'+p).join(' / ');
  const lo=io.min??config.min, hi=io.max??config.max;
  const range=Number.isFinite(lo) && Number.isFinite(hi) && lo < hi ? lo+'–'+hi : null;
  return {virtual,physical,range,type:io.type || channel.value_type,output:channel.direction==='output'};
}

export function latestReading(channel,rows,now=Date.now()){
  const scoped=(rows||[]).filter(row=>row?.channel_id===channel.id && timestamp(row.recorded_at,now));
  const sample=validStreamReadings(scoped,channel.value_type).at(-1);
  if(!sample) return null;
  const value=streamValue(sample,channel.value_type);
  return {value:channel.value_type==='number'?displayStreamNumber(value,channel)+(channel.unit?' '+channel.unit:''):channel.value_type==='boolean'?(value?'On':'Off'):String(value).slice(0,200),
    time:sample.recorded_at,recent:sample.quality!=='estimated'&&now-Date.parse(sample.recorded_at)<=20_000};
}

export function confirmedOutput(channel, state, cmd){
  if(!cmd || channel.direction!=='output' || !uuid(cmd.id) || cmd.device_id!==channel.device_id || cmd.channel_id!==channel.id || !state?.last_boot || cmd.boot!==state.last_boot ||
    cmd.state!=='applied' || cmd.result?.state!=='applied' || !timestamp(cmd.result_at,Date.now())) return null;
  const pin=String(channel.config?.physical_pin||'').match(/^GPIO(\d{1,2})$/);
  const output=pin&&state.reported?.outputs?.find(row=>row.pin===Number(pin[1])&&row.command===cmd.id);
  if(!output || JSON.stringify(output.applied)!==JSON.stringify(cmd.result.applied))return null;
  const value=cmd.result.applied,type=streamFacts(channel).type, first=Array.isArray(value)&&value.length===1?value[0]:value;
  let label=null;
  if(type==='rgb' && Array.isArray(value) && value.length===3 && value.every(v=>Number.isInteger(v)&&v>=0&&v<=255))label='#'+value.map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
  if(type==='boolean' && [true,false,1,0].includes(first))label=first?'On':'Off';
  if(type==='number' && Number.isFinite(first))label=String(first)+(channel.unit?' '+channel.unit:'');
  return label===null ? null : {value:label,time:cmd.result_at};
}

export async function loadDeviceReports(request, devices, current=()=>true) {
  const reports = new Map();
  const hardware = devices.filter(device => device.config?.mode !== 'simulation');
  for (let i=0; i<hardware.length && current(); i+=6) {
    await Promise.all(hardware.slice(i,i+6).map(async device => {
      try {
        const response = await request('/rest/v1/rpc/rs_io_device_status', {
          method:'POST', authenticated:true, body:{p_device:device.id}
        });
        const report = cleanReport(device,response);
        if (report) reports.set(device.id,report);
      } catch { /* Keep unknown states visible when a diagnostic is unavailable. */ }
    }));
  }
  return reports;
}

export function addFacts(parent, entries) {
  const list = document.createElement('dl');
  list.className = 'console-facts';
  for (const [label,value] of entries) {
    const row=document.createElement('div'), key=document.createElement('dt'), result=document.createElement('dd');
    key.textContent=label;
    result.textContent=value ?? 'Not reported';
    row.append(key,result);
    list.append(row);
  }
  parent.append(list);
  return list;
}

export function renderDeviceCard(device, report, counts, projectName, {onDetails,onDashboard,onEvents}) {
  const card=document.createElement('article');
  card.className='device-card';
  const title=document.createElement('h3'), info=document.createElement('p'), heading=document.createElement('div');
  const label=document.createElement('div'), badge=document.createElement('span');
  heading.className='device-card-head';
  title.textContent=device.label;
  info.textContent=device.board_model+' · '+projectName;
  badge.className='console-pill';
  badge.dataset.state=report.status;
  badge.textContent={online:'Online',stale:'Stale',offline:'Offline',simulation:'Simulation',unknown:'Unverified'}[report.status];
  label.append(title,info);
  heading.append(label,badge);
  card.append(heading);
  const facts=document.createElement('div');
  addFacts(facts,[
    ['Sensor / output streams',counts ? counts.sensors+' / '+counts.outputs : 'Checking'],
    ['Sensor upload',inventoryDate(report.lastUpload)],
    ['Control contact',inventoryDate(report.controlContact)],
    ['Backlog',report.backlog===null?null:report.backlog+' snapshots at last report'],
    ['Firmware',report.firmware]
  ]);
  card.append(facts);

  const diagnostics=document.createElement('details'), summary=document.createElement('summary');
  diagnostics.className='device-diagnostics';
  summary.textContent='Device diagnostics';
  diagnostics.append(summary);
  addFacts(diagnostics,[
    ['Wi-Fi',report.wifiConnected===null?null:report.wifiConnected?'Connected at last report':'Disconnected at last report'],
    ['RSSI',report.rssi===null?null:report.rssi+' dBm'],
    ['Previous upload HTTP',report.http],
    ['Board clock',report.clock===null?null:report.clock?'Valid at last upload':'Waiting for time at last upload'],
    ['Samples skipped',report.lost],
    ['Last successful ACK',report.lastAck?inventoryDate(report.lastAck):null],
    ['Pending / expired / rejected',[report.pending,report.expired,report.rejected].map(value=>value??'—').join(' / ')],
    ['Free heap',report.heap===null?null:report.heap+' bytes'],
    ['TLS code',report.tls]
  ]);
  const events=document.createElement('button');
  events.type='button';
  events.className='text-button';
  events.textContent='View recent events';
  events.addEventListener('click',onEvents);
  diagnostics.append(events);
  const actions=document.createElement('div');
  actions.className='console-actions';
  for (const [name,handler] of [['Device details',onDetails],['Open dashboard',onDashboard]]) {
    const button=document.createElement('button');
    button.type='button';
    button.className='button secondary';
    button.textContent=name;
    button.setAttribute('aria-label',name+' for '+device.label);
    button.addEventListener('click',handler);
    actions.append(button);
  }
  card.append(diagnostics,actions);
  return card;
}
