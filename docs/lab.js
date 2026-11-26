import { openHardwareSetup } from './hardware-setup.js?v=3.0.2';
import { createControlStreamDialog } from './control-stream-dialog.js?v=0.37.0';
import { controlPresets } from './stream-presets.js?v=0.36.1';
import { streamMappingLabel } from './stream-mapping.js?v=0.36.1';
import { sensorBoard } from './sensor-boards.js?v=0.36.1';
import { boardPinProfile, physicalPinOptions, normalizePinMapping, applyPinMapping, samePinConfig, pinSummary, pinCode } from './stream-pins.js?v=0.36.1';
import { matchingGroupDevices } from './library-model.js?v=0.36.1';
import { createProjectLibrary } from './project-library.js?v=0.36.1';
import { SENSOR_PRESETS, ESP32_MODULES, makeStreamDefinition, simulatedValue, streamValue, validStreamReadings } from './sensor-catalog.js?v=0.36.1';
import { createAnalytics } from './analytics.js?v=3.0.0';
import { createDashboard } from './dashboard.js?v=3.0.3';
import { createRules } from './rules.js?v=3.0.0';
import { supportsUsbSensor, usbSensorBinding, sensorUsbBinding } from './usb-sensor.js?v=0.36.1';
import { addFacts, confirmedOutput, deviceReport, inventoryDate, latestReading, loadDeviceReports, renderDeviceCard, streamFacts } from './device-inventory.js?v=3.0.0';
import { streamDescriptor, negotiateStreamCapabilities } from './stream-contract.js?v=0.36.1';
// Device registration and an explicitly labeled browser simulation.
// All records are written using the signed-in learner's access token and RLS.
export function createLab({ request, friendlyError, getSession, getGeneration, onDeleteDevice, isDeleting=()=>false }) {
  const $=id=>document.getElementById(id);
  const show=(id,on=true)=>{$(id).hidden=!on;};
  const message=(id,text)=>{$(id).textContent=text;show(id,!!text);};
  const presets=Object.fromEntries(SENSOR_PRESETS.map(p=>[p.key,p]));
  let project=null,devices=[],device=null,channels=[],channel=null,readings=[],events=[];
  let viewVersion=0,deviceVersion=0,dataVersion=0,eventVersion=0,deviceLoadVersion=0;
  let deviceBusy=false,streamBusy=false,runBusy=false;
  let pendingDevice=null,afterDeviceSaved=null,pinBusy=false,pinTarget=null;
  let streamState='idle',readingState='idle';
  let activeView='devices', deviceReports=new Map(), deviceCounts=new Map(), directoryValues=new Map(), directoryRun=0;
  const publishView=view=>dispatchEvent(new CustomEvent('robosynct:project-view',{detail:view}));
  let usbBindingUrl=null,usbBindingText='',usbBindingVersion=0;
  const pendingRuns=new Map(),pendingLive=new Map();
  let liveActive=false,liveTimer=null,liveVersion=0,liveIndex=0;
  const library=createProjectLibrary({request,friendlyError,getSession,getGeneration,onApplied:id=>loadDevices(id),onChanged:()=>{renderDeviceGroups();renderDevices();dashboard.libraryChanged();},hasDashboardDraft:()=>dashboard.hasPendingChanges(),onRegisterDevice:()=>{showProjectTab('data',false);newDevice();},onStageExperiment:async(bp,target,review)=>{await dashboard.open(project,devices);await dashboard.stageExperiment(bp,target,review);showProjectTab('dashboard',false);}});
  const controlStreams=createControlStreamDialog({request,getScope:()=>({owner:getSession()?.user?.id,project:project?.id,generation:getGeneration(),devices,channels}),onSaved:row=>{if(!project||!devices.some(d=>d.id===row.device_id))return;if(device?.id===row.device_id){channels=channels.filter(c=>c.id!==row.id);channels.push(row);readings=[];readingState='idle';renderChannels(row.id);renderReadings();message('lab-notice','Control output created. Add its matching widget, then configure the board separately.');}}});
  addEventListener('pagehide',()=>controlStreams.reset());
  const createControlStream=(widget='',preferredDevice='',purpose='')=>controlStreams.open({widget,device:preferredDevice||device?.id||'',purpose});
  const dashboard=createDashboard({request,friendlyError,getSession,getGeneration,createControlStream,getLibrary:()=>library.snapshot(),onCaptureBlueprint:(bp,id)=>library.addBlueprint(bp,id)});
  const analytics=createAnalytics({request,friendlyError,getSession,getGeneration});
  const ruleBuilder=createRules({request,friendlyError,getSession,getGeneration,onViewEvents:async id=>{showProjectTab('events');const target=devices.find(d=>d.id===id);if(target)await selectDevice(target);}});
  const uuid=()=>crypto.randomUUID();
  const alive=(v,g)=>project&&v===viewVersion&&g===getGeneration()&&getSession();
  const context=()=>({v:viewVersion,g:getGeneration(),d:deviceVersion});
  const current=ctx=>alive(ctx.v,ctx.g)&&ctx.d===deviceVersion;
  const isSimulation=d=>d?.config?.mode==='simulation';
  const assertRows=rows=>{if(!Array.isArray(rows))throw new Error('Unexpected response');return rows;};
  function clearUsbBinding(){
    usbBindingVersion++;usbBindingText='';
    if(usbBindingUrl)URL.revokeObjectURL(usbBindingUrl);usbBindingUrl=null;
    $('usb-binding-json').value='';$('usb-binding-summary').textContent='';$('usb-binding-download').removeAttribute('href');
    $('usb-binding-copy').disabled=true;$('usb-binding-manual').open=false;message('usb-binding-status','');
  }
  function closeUsbBinding(){if($('usb-binding-dialog').open)$('usb-binding-dialog').close();clearUsbBinding();}
  function openUsbBinding(multi=false){
    closeUsbBinding();if(!getSession()||isDeleting())return;
    const binding=multi?sensorUsbBinding(project,device,channels):usbSensorBinding(project,device,channel);if(!binding)return;
    usbBindingText=JSON.stringify(binding,null,2)+'\n';
    usbBindingUrl=URL.createObjectURL(new Blob([usbBindingText],{type:'application/json'}));
    $('usb-binding-json').value=usbBindingText;$('usb-binding-summary').textContent=device.label+' · '+(multi?Object.keys(binding.streams).length+' sensor streams':channel.title)+' · Existing project and stream IDs';
    $('usb-binding-download').setAttribute('href',usbBindingUrl);$('usb-binding-download').download=multi?'RoboSynct_Sensor_USB_Binding.json':'RoboSynct_USB_Binding.json';
    $('usb-binding-copy').disabled=false;$('usb-binding-dialog').showModal();
  }
  async function copyUsbBinding(){
    if(!getSession()||!usbBindingText||isDeleting())return;
    const version=usbBindingVersion,generation=getGeneration(),text=usbBindingText;
    $('usb-binding-copy').disabled=true;
    const valid=()=>version===usbBindingVersion&&generation===getGeneration()&&getSession();
    try{
      await navigator.clipboard.writeText(text);
      if(valid())message('usb-binding-status','Copied. Paste into Notepad, then Save as RoboSynct_USB_Binding.json. Choose All files and UTF-8.');
    }catch{
      if(valid()){$('usb-binding-manual').open=true;$('usb-binding-json').focus();message('usb-binding-status','Copy is unavailable. Select and copy the JSON below, then save it as RoboSynct_USB_Binding.json using All files and UTF-8.');}
    }finally{if(valid())$('usb-binding-copy').disabled=false;}
  }
  function reset(notify=true) {
    controlStreams.reset();
    closeUsbBinding();pinTarget=null;if($('stream-pin-dialog').open)$('stream-pin-dialog').close();$('stream-pin-context').textContent='';$('stream-pin-code').textContent='';
    stopLive();pendingLive.clear();dashboard.reset();library.reset();ruleBuilder.reset();analytics.reset();showProjectTab('devices',false,false);directoryRun++;deviceReports.clear();deviceCounts.clear();directoryValues.clear();
    viewVersion++;deviceVersion++;dataVersion++;eventVersion++;deviceLoadVersion++;
    project=null;devices=[];device=null;channels=[];channel=null;readings=[];events=[];pendingDevice=null;afterDeviceSaved=null;pendingRuns.clear();
    streamState='idle';readingState='idle';$('device-search').value='';$('device-filter-mode').value='all';$('device-filter-group').value='';$('device-filter-status').value='all';
    $('device-search-summary').textContent='';show('device-no-matches',false);show('device-readiness',false);show('usb-sensor-starter',false);$('download-usb-binding').disabled=true;$('download-sensor-usb-binding').disabled=true;
    $('device-list').replaceChildren();$('event-list').replaceChildren();$('chart-container').replaceChildren();
    for(const id of ['project-workspace-title','project-workspace-description','selected-device-name','selected-device-meta'])$(id).textContent='';
    $('device-setup-check').textContent='4';$('device-setup-check').classList.toggle('pending',true);$('device-setup-text').textContent='Open a project and add a simulated ESP32 to begin.';
    show('project-workspace',false);show('workspace-overview');if(notify)publishView('overview');
    message('lab-error','');message('lab-notice','');
  }
  async function open(next) {
    reset(false);project=next;
    $('project-workspace-title').textContent=next.name;
    $('project-workspace-description').textContent=next.description||'';
    show('workspace-overview',false);show('project-workspace');
    show('sensor-content',false);show('sensor-empty');$('events-empty').textContent='Choose a device to view its events.';show('events-empty');
    publishView(activeView);
    const version=viewVersion;
    await loadDevices();
    if(version===viewVersion&&project&&getSession())await library.open(project,devices);
  }
  function renderDeviceGroups(){const select=$('device-filter-group'),prior=select.value,groups=(library.snapshot().groups||[]).filter(g=>!g.archived);select.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='All groups';select.append(all);for(const group of groups){const option=document.createElement('option');option.value=group.id;option.textContent=group.name;select.append(option);}select.value=groups.some(g=>g.id===prior)?prior:'';}
  function renderDevices() {
    const expanded=new Set([...$('device-list').querySelectorAll('article:has(details[open])')].map(card=>card.dataset.device));
    $('device-list').replaceChildren();$('device-count').textContent=String(devices.length);show('devices-empty',devices.length===0);
    $('device-setup-check').textContent=devices.length?'✓':'4';$('device-setup-check').classList.toggle('pending',!devices.length);
    $('device-setup-text').textContent=devices.length?'Device details are saved. Select a device to inspect its streams; registration does not verify a hardware link.':'Open a project and add a simulated ESP32 to begin.';
    const query=$('device-search').value.trim().toLocaleLowerCase(),mode=$('device-filter-mode').value||'all',status=$('device-filter-status').value||'all';
    const group=(library.snapshot().groups||[]).find(g=>g.id===$('device-filter-group').value&&!g.archived),allowed=group?new Set(matchingGroupDevices(group,devices,library.snapshot().channels||[],project?.id).map(d=>d.id)):null;
    const visible=devices.filter(row=>(!allowed||allowed.has(row.id))&&(!query||[row.label,row.board_model,row.transport,row.id].join(' ').toLocaleLowerCase().includes(query))&&(mode==='all'||(mode==='simulation'?isSimulation(row):!isSimulation(row)))&&(status==='all'||deviceReport(row,deviceReports.get(row.id)).status===status));
    $('device-search-summary').textContent=visible.length+' of '+devices.length+' devices · filters affect this list only';
    show('device-no-matches',devices.length>0&&visible.length===0);
    for(const row of visible){
      const report=deviceReport(row,deviceReports.get(row.id));
      const card=renderDeviceCard(row,report,deviceCounts.get(row.id),project?.name||'',{
        onDetails:async()=>{
          if(!canLeave())return;
          if(device?.id!==row.id)await selectDevice(row);
          if(device?.id===row.id)await showProjectTab('datastreams');
        },
        onDashboard:()=>{if(canLeave())showProjectTab('dashboard');},
        onEvents:async()=>{
          if(!canLeave())return;
          if(device?.id!==row.id)await selectDevice(row);
          if(device?.id===row.id)await showProjectTab('events');
        }
      });
      card.dataset.device=row.id;card.querySelector('details').open=expanded.has(row.id);
      $('device-list').append(card);
    }
    renderDeviceScope();
  }

  function renderDeviceScope(){
    const select=$('device-scope');
    select.replaceChildren(...devices.map(row=>new Option(row.label,row.id)));
    if(!devices.length)select.append(new Option('No devices',''));
    select.value=device?.id||'';
    select.disabled=!devices.length;
  }

  function readDeviceFacts(records,isCurrent){
    if(!records.length)return;
    const reportTask=loadDeviceReports(request,records,isCurrent);
    const countTask=(async()=>{
      const counts=new Map();
      for(let start=0;start<records.length&&isCurrent();start+=30){
        const batch=records.slice(start,start+30),ids=batch.map(row=>row.id).join(',');
        try{
          const result=assertRows(await request('/rest/v1/channels?select=device_id,direction&device_id=in.('+encodeURIComponent(ids)+')',{authenticated:true}));
          for(const row of batch)counts.set(row.id,{sensors:0,outputs:0});
          for(const row of result){
            const count=counts.get(row.device_id);
            if(count){if(row.direction==='output')count.outputs++;else if(row.direction==='input')count.sensors++;}
          }
        }catch{}
      }
      return counts;
    })();
    Promise.all([reportTask,countTask]).then(([reports,counts])=>{
      if(!isCurrent())return;
      deviceReports=reports;
      for(const [id,count] of counts){if(id!==device?.id||streamState!=='ready')deviceCounts.set(id,count);}
      if(activeView==='devices')renderDevices();
      if(activeView==='datastreams')refreshDirectory();
    });
  }

  function renderDirectory(){
    if(activeView!=='datastreams')return;
    const root=$('directory-rows'),query=$('directory-search').value.trim().toLocaleLowerCase(),state=deviceReports.get(device?.id);
    const visible=channels.filter(row=>[row.title,row.channel_key,streamFacts(row).virtual,streamFacts(row).physical].join(' ').toLowerCase().includes(query));
    root.replaceChildren();
    if(!visible.length){
      const empty=document.createElement('p');
      empty.className='subtle';
      empty.textContent=!device?'Add a device to see its streams.':streamState==='loading'?'Loading streams…':streamState==='error'?'Stream list unavailable.':query?'No matching streams.':'No streams on this device yet.';
      root.append(empty);
    }
    for(const row of visible){
      const facts=streamFacts(row),latest=directoryValues.get(row.id);
      const article=document.createElement('article'),title=document.createElement('h3'),key=document.createElement('code'),pins=document.createElement('div');
      title.textContent=row.title; key.textContent=row.channel_key; pins.className='pin-pair';
      for(const label of ['Virtual '+(facts.virtual||'unassigned'),facts.physical||'GPIO unassigned']){
        const pin=document.createElement('span');pin.textContent=label;pins.append(pin);
      }
      let validation='Saved input';
      try{
        const descriptor=streamDescriptor(row,device,{capabilities:negotiateStreamCapabilities(state?.capabilities,device.board_model,true)});
        if(facts.output)validation=descriptor.enabled?(deviceReport(device,state).controlOnline?'Control ready':'Control contact stale'):'Awaiting matching board output';
      }catch{validation='Review stream configuration';}
      article.append(title,key,pins);
      addFacts(article,[['Direction / type',(facts.output?'Output':'Input')+' · '+facts.type],['Range',facts.range||'—'],['Unit',row.unit||'—'],['Source',device.label],['Status',validation],['Latest value',latest?.value ?? '—'],[facts.output?'Board acknowledged':'Recorded',inventoryDate(latest?.time)]]);
      const inspect=document.createElement('button');
      inspect.type='button';inspect.className='text-button';inspect.textContent='Inspect stream';
      inspect.addEventListener('click',()=>{
        $('stream-select').value=row.id;
        $('stream-select').dispatchEvent(new Event('change'));
        $('stream-select').focus();
        $('stream-select').scrollIntoView({block:'center'});
      });
      article.append(inspect);root.append(article);
    }
  }

  async function refreshDirectory(){
    const run=++directoryRun,ctx=context(),state=deviceReports.get(device?.id);
    const currentRun=()=>run===directoryRun&&current(ctx)&&activeView==='datastreams';
    renderDirectory();
    if(!device||streamState!=='ready'||navigator.onLine===false)return;
    for(let offset=0;offset<channels.length&&currentRun();offset+=6){
      await Promise.all(channels.slice(offset,offset+6).map(async row=>{
        try{
          let latest;
          if(row.direction==='output'){
            const pin=String(row.config?.physical_pin||'').match(/^GPIO(\d{1,2})$/);
            const report=pin&&state?.reported?.outputs?.find(output=>output.pin===Number(pin[1]));
            if(report){
              const ack=await request('/rest/v1/rpc/rs_command_status',{method:'POST',authenticated:true,body:{p_command:report.command}});
              latest=confirmedOutput(row,state,ack);
            }
          }else{
            const rows=assertRows(await request('/rest/v1/telemetry?select=id,channel_id,recorded_at,value_num,value_bool,value_text,quality&channel_id=eq.'+encodeURIComponent(row.id)+'&order=recorded_at.desc,id.desc&limit=12',{authenticated:true}));
            latest=latestReading(row,rows);
          }
          if(currentRun())directoryValues.set(row.id,latest||null);
        }catch{}
      }));
    }
    if(currentRun())renderDirectory();
  }
  async function loadDevices(preferredId) {
    if(!project||!getSession())return;
    const {v,g}=context(),load=++deviceLoadVersion;
    show('devices-loading');$('refresh-devices-button').disabled=true;
    try{
      const rows=assertRows(await request('/rest/v1/devices?select=id,project_id,label,board_model,transport,config,created_at,last_seen_at&project_id=eq.'+encodeURIComponent(project.id)+'&order=created_at.asc',{authenticated:true}));
      if(!alive(v,g)||load!==deviceLoadVersion)return;
      const oldId=preferredId||device?.id;devices=rows;
      readDeviceFacts(rows,()=>alive(v,g)&&load===deviceLoadVersion);
      device=rows.find(d=>d.id===oldId)||rows[0]||null;renderDevices();
      if(device)await selectDevice(device);else{show('sensor-content',false);show('sensor-empty');}
    }catch(err){if(alive(v,g)&&load===deviceLoadVersion)message('lab-error',friendlyError(err,'Couldn’t load devices. Use the device refresh button to try again.'));}
    finally{if(alive(v,g)&&load===deviceLoadVersion){show('devices-loading',false);$('refresh-devices-button').disabled=false;}}
  }
  async function selectDevice(next) {
    closeUsbBinding();if($('stream-pin-dialog').open)$('stream-pin-dialog').close();pinTarget=null;
    stopLive();message('lab-error','');device=next;deviceVersion++;dataVersion++;eventVersion++;channels=[];channel=null;readings=[];events=[];
    streamState='loading';readingState='idle';directoryRun++;directoryValues.clear();renderDirectory();
    $('event-list').replaceChildren();$('stream-select').replaceChildren();renderDevices();renderReadings();
    $('selected-device-name').textContent=device.label;$('selected-device-meta').textContent=device.board_model+' · '+(isSimulation(device)?'Browser simulation':'Registered hardware');
    $('device-mode-badge').textContent=isSimulation(device)?'SIMULATED':'LINK UNVERIFIED';$('device-mode-badge').className='mode-badge'+(isSimulation(device)?'':' hardware');
    $('simulation-note').textContent=isSimulation(device)?'Simulation mode · Generated in your browser, saved to your database. No physical board is connected.':'Readings and output reports for this device.';
    show('sensor-empty',false);show('sensor-content');show('readings-loading');
    updateRunButton();const ctx=context();
    const streamTask=(async()=>{
      try{
        const rows=assertRows(await request('/rest/v1/channels?select=id,device_id,channel_key,title,unit,value_type,direction,config&device_id=eq.'+encodeURIComponent(next.id)+'&order=title.asc',{authenticated:true}));
        if(!current(ctx))return;
        streamState='ready';channels=rows.filter(ch=>['number','boolean','text'].includes(ch.value_type));renderChannels();
        deviceCounts.set(next.id,{sensors:channels.filter(c=>c.direction==='input').length,outputs:channels.filter(c=>c.direction==='output').length});
        if(activeView==='devices')renderDevices();
        if(activeView==='datastreams')refreshDirectory();
        if(channel)await loadReadings();else{renderReadings();show('readings-loading',false);}
      }catch(err){if(current(ctx)){streamState='error';renderReadiness();message('lab-error',friendlyError(err,'Couldn’t load sensor streams. Select the device again to retry.'));show('readings-loading',false);}}
    })();
    await Promise.all([streamTask,loadEvents()]);
  }
  function renderChannels(preferred) {
    $('stream-select').replaceChildren();
    for(const row of channels){const option=document.createElement('option');option.value=row.id;option.textContent=streamMappingLabel(row,device?[device]:[]);$('stream-select').append(option);}
    channel=channels.find(ch=>ch.id===preferred)||channels[0]||null;
    renderDirectory();
    if(!channel){const option=document.createElement('option');option.value='';option.textContent='No streams yet';$('stream-select').append(option);}
    $('stream-select').value=channel?.id||'';$('stream-select').disabled=!channel;$('stream-pin-setup').disabled=!channel||channel.direction==='output'||pinBusy;updateRunButton();renderReadiness();
  }
  function renderReadiness(){
    $('add-control-stream-button').disabled=!device||!getSession();$('add-hardware-stream-button').disabled=!device||!getSession();show('device-readiness',!!device);if(!device)return;
    const direct=sensorBoard(device.board_model)?.transport==='ble_wifi',multi=sensorUsbBinding(project,device,channels),usb=supportsUsbSensor(device)||!!multi,binding=usbSensorBinding(project,device,channel);$('download-sensor-usb-binding').disabled=!multi||!getSession();
    show('usb-sensor-starter',usb);$('download-usb-binding').disabled=!binding||!getSession();
    $('usb-binding-help').textContent=multi?'Sensor binding selects '+Object.keys(multi.streams).length+' existing compatible input streams. It contains public configuration and IDs, never sign-in tokens. The original binding button remains for legacy ESP32 firmware.':binding?'This file selects your existing device and Potentiometer raw stream. It contains public configuration and record IDs, never your password or sign-in tokens.':'Choose Add stream → Potentiometer, then select that raw input to enable the binding download. Existing streams and history stay in place.';
    $('readiness-registration').textContent='Saved in this project';
    $('readiness-streams').textContent=streamState==='error'?'Could not verify · select this device to retry':streamState==='loading'?'Checking saved streams…':channels.length?channels.length+' supported stream'+(channels.length===1?'':'s')+' loaded':'Add a sensor stream';
    const valid=validReadings(),latest=valid.at(-1),date=latest?new Date(latest.recorded_at):null;
    $('readiness-data').textContent=readingState==='error'?'Could not verify · use Refresh':readingState==='loading'?'Checking saved samples…':readingState!=='ready'?'Not checked · select a loaded stream':valid.length?valid.length+' saved samples · latest '+(date&&!Number.isNaN(date.getTime())?date.toLocaleString():'time unavailable'):'No saved samples in this time range';
    $('readiness-link').textContent=isSimulation(device)?'Browser simulation · no physical board':usb?(direct?'Not verified in browser · Android or USB bridge required':'Not verified in browser · laptop USB bridge required'):'Not verified · firmware and an ingestion adapter are required';
    $('readiness-next').textContent=channel?.direction==='output'?'Add a matching control widget on Dashboard. Configure matching output firmware separately.':streamState==='loading'||readingState==='loading'?'Checking the saved setup for this device…':streamState==='error'?'Select this device again to retry loading its streams.':!channels.length?'Use Add stream to create a data channel.':readingState==='error'?'Use Refresh to retry this stream. Existing samples are kept.':isSimulation(device)?(valid.length?'Saved simulation data is ready for your dashboard.':'Use Run sensor test to save clearly labeled practice samples.'):usb?(direct?'Use Connect device for Android Bluetooth/local Wi-Fi, or keep the USB bridge below. Stored samples do not prove a current local link.':'Review the Uno sensor profile, download Sensor USB binding, then use the laptop USB bridge. Uno does not provide native Bluetooth/Wi-Fi.'):'Use Connect device for guided Android BLE/local Wi-Fi setup. The browser verifies saved uploads, not the phone’s local radio link.';
  }
  function updateRunButton(){
    const simulation=isSimulation(device),supported=channel?.direction!=='output'&&['number','boolean','text'].includes(channel?.value_type);
    $('run-test-button').disabled=!simulation||!channel||!supported||runBusy||liveActive;
    $('run-test-button').textContent=runBusy?'Saving test…':'Run sensor test';
    $('live-stream-button').disabled=!simulation||!supported||runBusy;
    $('live-stream-button').textContent=liveActive?'Stop live simulation':'Start live simulation';show('dashboard-live-stream-bar',liveActive);
    if(liveActive)$('dashboard-live-stream-status').textContent=(device?.label||'Device')+' / '+(channel?.title||'Stream')+' · Generated samples every 5 seconds. Widgets update from saved readings.';
    $('test-title').textContent=channel?.direction==='output'?'Control output':simulation?'Ready for a test run?':'Hardware is registered.';
    $('test-description').textContent=!simulation?(supportsUsbSensor(device)?'The USB starter includes sensor firmware and a PC adapter. The browser does not monitor your physical link.':'Sensor ingestion requires board firmware and an ingestion adapter.'):!channel?'Add a sensor stream to begin.':'Save 12 generated samples. Temperature tests also demonstrate a warning event.';
  }
  function populatePresets(id,search='',preferred='temperature',custom=false){
    const select=$(id);select.replaceChildren();const groups=new Map(),query=search.trim().toLowerCase();
    if(id==='new-stream-preset'&&$('stream-catalog').value==='controls'){const choices=controlPresets().filter(p=>!query||[p.label,p.help,p.id].join(' ').toLowerCase().includes(query));for(const p of choices){const o=document.createElement('option');o.value='control:'+p.id;o.textContent=p.label;select.append(o);}select.value=choices.some(p=>'control:'+p.id===preferred)?preferred:choices[0]?'control:'+choices[0].id:'';return;}
    if(id==='new-stream-preset'&&$('stream-catalog').value==='esp32'){
      const available=ESP32_MODULES.filter(m=>!query||[m.title,m.key,m.group,...m.streams.map(key=>presets[key]?.title||key)].join(' ').toLowerCase().includes(query));
      for(const m of available){if(!groups.has(m.group)){const group=document.createElement('optgroup');group.label=m.group;groups.set(m.group,group);select.append(group);}const option=document.createElement('option');option.value='esp32:'+m.key;option.textContent=m.title+' · '+m.streams.length+' stream'+(m.streams.length===1?'':'s');groups.get(m.group).append(option);}
      const custom=document.createElement('option');custom.value='custom';custom.textContent='＋ Custom stream';select.append(custom);select.value=available.some(m=>'esp32:'+m.key===preferred)||preferred==='custom'?preferred:available[0]?'esp32:'+available[0].key:'custom';return;
    }
    for(const p of SENSOR_PRESETS){
      if(query&&![p.title,p.key,p.group,p.examples,p.value_type].join(' ').toLowerCase().includes(query))continue;
      if(!groups.has(p.group)){const group=document.createElement('optgroup');group.label=p.group;groups.set(p.group,group);select.append(group);}
      const option=document.createElement('option');option.value=p.key;option.textContent=p.title+(p.unit?' ('+p.unit+')':'')+' · '+({number:'Number',boolean:'On / off',text:'Text'}[p.value_type]);groups.get(p.group).append(option);
    }
    if(custom){const option=document.createElement('option');option.value='custom';option.textContent='＋ Custom stream';select.append(option);}
    const available=SENSOR_PRESETS.filter(p=>!query||[p.title,p.key,p.group,p.examples,p.value_type].join(' ').toLowerCase().includes(query));
    select.value=available.some(p=>p.key===preferred)||custom&&preferred==='custom'?preferred:available[0]?.key||(custom?'custom':'');
  }
  function streamFields(){
    const key=$('new-stream-preset').value,p=presets[key],module=ESP32_MODULES.find(m=>'esp32:'+m.key===key),custom=key==='custom',type=$('custom-stream-type').value;
    const output=key.startsWith('control:');show('stream-output-help',output);show('stream-pin-fields-wrap',!output);$('save-stream-button').textContent=output?'Set up control stream':'Add stream ↗';if(output){$('stream-preset-help').textContent=controlPresets().find(p=>'control:'+p.id===key)?.help||'Choose an output.';show('custom-stream-fields',false);return;}
    show('custom-stream-fields',custom);show('custom-number-fields',custom&&type==='number');show('custom-text-fields',custom&&type==='text');
    for(const id of ['custom-stream-min','custom-stream-max'])$(id).disabled=!custom||type!=='number';
    $('stream-preset-help').textContent=module?module.title+' · Adds '+module.streams.map(k=>presets[k].title).join(', ')+'. Existing stream keys are reused. Use custom keys for multiple identical modules. This sets up data streams; hardware firmware and pairing are still required.':p?p.group+' · '+p.examples+(p.value_type==='number'?' · Practice range: '+p.min+'–'+p.max+' '+p.unit:' · '+(p.value_type==='boolean'?'On / off readings':'Text readings')):custom?'Define a stream for a sensor or message not listed above.':'No matching templates. Try a different search.';newStreamPinFields();
  }
  function fillPhysicalPins(id,target,ch,selected='',defaults=false){
    const select=$(id);select.replaceChildren();const blank=document.createElement('option');blank.value='';blank.textContent='Not assigned · use the sketch wiring';select.append(blank);const options=physicalPinOptions(target?.board_model,ch);
    for(const pin of options){const option=document.createElement('option');option.value=pin.value;option.textContent=pin.label;select.append(option);}
    const fallback=defaults&&ch?.channel_key==='pot_raw'?(boardPinProfile(target?.board_model)==='esp32'?'GPIO34':boardPinProfile(target?.board_model)==='uno'?'A0':''):'';
    select.value=options.some(p=>p.value===selected)?selected:fallback;select.disabled=!options.length;
  }
  function newStreamPinFields(){
    const key=$('new-stream-preset').value,module=ESP32_MODULES.find(m=>'esp32:'+m.key===key),multi=module&&module.streams.length>1,ch={channel_key:module?.streams[0]||key,value_type:presets[key]?.value_type||$('custom-stream-type').value};
    fillPhysicalPins('new-stream-physical-pin',device,ch,$('new-stream-physical-pin').value,true);$('new-stream-physical-pin').disabled=multi||!physicalPinOptions(device?.board_model,ch).length;$('new-stream-virtual-pin').disabled=!!multi;
    $('new-stream-pin-help').textContent=multi?'This profile has several streams. Add it first, then use Pin setup for each stream.':ch.channel_key==='pot_raw'?'Current ESP32 starter reads GPIO34. A different pin needs the SENSOR_PIN constant changed in a compatible sketch. Uno uses an analog pin such as A0 with its own sketch/adapter.':'Choose the physical pin used by your compatible sensor sketch. V0 is a data label, not a socket. Bus sensors may need multiple pins set in their library. This form does not program hardware.';
  }
  function pinPreview(){if(!pinTarget)return;try{const mapping=normalizePinMapping({physical_pin:$('stream-physical-pin').value,virtual_pin:$('stream-virtual-pin').value},pinTarget.board,pinTarget.row);$('stream-pin-code').textContent=pinCode(pinTarget.board,pinTarget.row,mapping);$('stream-pin-help').textContent=pinTarget.row.channel_key==='pot_raw'&&mapping.physical_pin&&mapping.physical_pin!=='GPIO34'&&boardPinProfile(pinTarget.board)==='esp32'?'Firmware change required: the current ESP32 starter reads GPIO34. Set SENSOR_PIN to '+mapping.physical_pin.slice(4)+' in your compatible sketch before using that wiring.':'Wiring plan only · physical wiring and firmware pin are not verified by the website.';}catch(e){$('stream-pin-code').textContent=e.message;}}
  function openPinSetup(){if(!device||!channel||channel.direction==='output'||pinBusy||!getSession())return;pinTarget={ctx:context(),row:clonePinChannel(channel),device:device.id,board:device.board_model};$('stream-pin-context').textContent=device.label+' / '+channel.title+' · Existing stream';fillPhysicalPins('stream-physical-pin',device,channel,channel.config?.physical_pin||'');$('stream-virtual-pin').value=channel.config?.virtual_pin||'';message('stream-pin-error','');pinPreview();$('stream-pin-dialog').showModal();}
  function clonePinChannel(row){return JSON.parse(JSON.stringify(row));}
  async function checkPinAlias(target,mapping,ownId){if(!mapping.virtual_pin)return;const rows=assertRows(await request('/rest/v1/channels?select=id,device_id,channel_key,title,unit,value_type,direction,config&device_id=eq.'+encodeURIComponent(target.id),{authenticated:true}));if(rows.some(row=>row.id!==ownId&&row.config?.virtual_pin===mapping.virtual_pin))throw new Error(mapping.virtual_pin+' is already assigned to another stream on this device. Choose another data label.');}
  async function savePinSetup(event){event.preventDefault();const job=pinTarget;if(pinBusy||!job||!$('stream-pin-dialog').open||!current(job.ctx)||channel?.id!==job.row.id)return;pinBusy=true;$('save-stream-pins').disabled=true;message('stream-pin-error','');
    const valid=()=>pinTarget===job&&current(job.ctx)&&channel?.id===job.row.id;
    try{const mapping=normalizePinMapping({physical_pin:$('stream-physical-pin').value,virtual_pin:$('stream-virtual-pin').value},job.board,job.row);await checkPinAlias({id:job.device},mapping,job.row.id);if(!valid())return;const query='/rest/v1/channels?select=id,device_id,channel_key,title,unit,value_type,direction,config&id=eq.'+encodeURIComponent(job.row.id)+'&device_id=eq.'+encodeURIComponent(job.device);let rows=assertRows(await request(query,{authenticated:true}));if(!valid())return;if(rows.length!==1)throw new Error('This existing stream is unavailable. Refresh its device.');const latest=rows[0],config=applyPinMapping(latest.config,mapping);
      if(!samePinConfig(config,latest.config)){const condition=latest.config===null||latest.config===undefined?'is.null':'eq.'+encodeURIComponent(JSON.stringify(latest.config));await request('/rest/v1/channels?id=eq.'+encodeURIComponent(job.row.id)+'&device_id=eq.'+encodeURIComponent(job.device)+'&config='+condition,{method:'PATCH',authenticated:true,prefer:'return=minimal',body:{config}});if(!valid())return;rows=assertRows(await request(query,{authenticated:true}));if(!valid())return;if(rows.length!==1||!samePinConfig(rows[0].config,config))throw new Error('The pin save was not confirmed or another session changed it. Your history is retained. Retry safely.');}
      const saved=rows[0];channels=channels.map(ch=>ch.id===saved.id?saved:ch);channel=saved;$('stream-pin-dialog').close();pinTarget=null;renderChannels(saved.id);renderReadings();message('lab-notice','Pin setup saved for the existing stream. This is a wiring plan; update matching firmware separately if needed. History and widget bindings are retained.');
    }catch(e){if(valid())message('stream-pin-error',e.status?friendlyError(e,'Pin setup could not be saved. Keep the current wiring and retry.'):e.message);}finally{pinBusy=false;$('save-stream-pins').disabled=false;$('stream-pin-setup').disabled=!channel;}
  }
  async function ensureChannel(target,presetKey,mapping=null){
    const def=makeStreamDefinition(presetKey,{key:$('custom-stream-key').value,title:$('custom-stream-title').value,unit:$('custom-stream-unit').value,value_type:$('custom-stream-type').value,min:$('custom-stream-min').value,max:$('custom-stream-max').value,samples:$('custom-stream-samples').value});
    const profile=sensorBoard(target.board_model);if(profile&&profile.id===4&&target.config?.mode==='hardware'&&['pot_raw','light_raw'].includes(def.channel_key))def.config={...def.config,min:0,max:1023,integer:true};
    if(mapping)def.config=applyPinMapping(def.config,mapping);
    const query='/rest/v1/channels?select=id,device_id,channel_key,title,unit,value_type,direction,config&device_id=eq.'+encodeURIComponent(target.id)+'&channel_key=eq.'+encodeURIComponent(def.channel_key);
    const verify=row=>{if(row.value_type!==def.value_type||row.direction!==def.direction)throw new Error('That stream key already exists with a different data type or direction. Choose another custom key.');if(mapping&&Object.keys(mapping).length&&Object.keys(mapping).some(key=>row.config?.[key]!==mapping[key]))throw new Error('That stream already exists with a different pin setup. Close this form and use Pin setup to review it without creating a duplicate.');return row;};
    const existing=assertRows(await request(query,{authenticated:true}));if(existing.length)return verify(existing[0]);
    await request('/rest/v1/channels?on_conflict=device_id,channel_key',{method:'POST',authenticated:true,prefer:'resolution=ignore-duplicates,return=minimal',body:{id:uuid(),device_id:target.id,...def}});
    const saved=assertRows(await request(query,{authenticated:true}));if(!saved[0])throw new Error('Stream could not be confirmed');return verify(saved[0]);
  }
  function newDevice({board='ESP32',hardware=false,onSaved=null}={}){
    if(!project)return;
    pendingDevice=null;afterDeviceSaved=onSaved;$('device-form').reset();$('device-label').value='';$('device-board').value=board;$('device-mode').value=hardware?'hardware':'simulation';$('device-sensor').value='temperature';message('device-error','');$('save-device-button').disabled=deviceBusy;$('device-dialog').showModal();$('device-label').focus();
  }
  async function recordEvents(rows){
    return request('/rest/v1/events?on_conflict=id',{method:'POST',authenticated:true,prefer:'resolution=ignore-duplicates,return=minimal',body:rows});
  }
  async function saveDevice(event){
    event.preventDefault();if(deviceBusy||!project||!getSession())return;
    const label=$('device-label').value.trim(),board=$('device-board').value,mode=$('device-mode').value,presetKey=$('device-sensor').value;
    if(!label){message('device-error','Give the device a name first.');return;}
    if(!['simulation','hardware'].includes(mode)||!presets[presetKey]){message('device-error','Choose a supported mode and sensor.');return;}
    const ctx=context(),signature=JSON.stringify([project.id,label,board,mode,presetKey]);
    if(pendingDevice?.signature!==signature)pendingDevice={signature,id:uuid(),eventId:uuid()};
    const draft=pendingDevice,afterSave=afterDeviceSaved;
    // Store the intended board transport using values accepted by both starter schemas.
    // config.mode/adapter explicitly mark a browser simulation; no MQTT connection is claimed.
    const transport=board==='Arduino Uno R3'?'usb_serial':'mqtt';
    const payload={id:draft.id,project_id:project.id,label,board_model:board,transport,config:{mode,adapter:mode==='simulation'?'browser-v1':'unpaired'}};
    deviceBusy=true;$('save-device-button').disabled=true;$('save-device-button').textContent='Adding device…';message('device-error','');
    let saved=false,streamAdded=false,eventAdded=false,streamError='',eventError='';
    try{
      await request('/rest/v1/devices?on_conflict=id',{method:'POST',authenticated:true,prefer:'resolution=ignore-duplicates,return=minimal',body:payload});
      if(!alive(ctx.v,ctx.g))return;
      const target=assertRows(await request('/rest/v1/devices?select=id,project_id,label,board_model,transport,config,created_at,last_seen_at&id=eq.'+encodeURIComponent(draft.id)+'&project_id=eq.'+encodeURIComponent(payload.project_id),{authenticated:true}))[0];
      if(!target){const error=new Error('Device lookup returned no record');error.code='DEVICE_READBACK_EMPTY';throw error;}saved=true;
      try{await ensureChannel(target,presetKey);streamAdded=true;}catch(err){streamError=friendlyError(err,'Sensor stream creation failed.');}
      if(!alive(ctx.v,ctx.g))return;
      try{await recordEvents([{id:draft.eventId,device_id:target.id,event_type:'device_registered',severity:'info',title:(mode==='simulation'?'Simulated device registered':'Hardware registered; pairing pending'),detail:{source:mode,board_model:board}}]);eventAdded=true;}catch(err){eventError=friendlyError(err,'Registration event could not be saved.');}
      if(!alive(ctx.v,ctx.g))return;
      $('device-dialog').close();pendingDevice=null;
      message('lab-error','');
      message('lab-notice',streamAdded&&eventAdded?(mode==='simulation'?'Device and sensor stream saved. Select Run sensor test to save your first readings.':'Hardware details saved. The board is registered but not connected.'):'Device saved.'+(!streamAdded?' Its first stream could not be created. Use Add stream to retry. '+streamError:'')+(!eventAdded?' The registration event could not be recorded. '+eventError:''));
      await loadDevices(target.id);
      if(alive(ctx.v,ctx.g))afterSave?.(target);
    }catch(err){if(alive(ctx.v,ctx.g))message('device-error',friendlyError(err,saved?'The device was saved. Close this form and refresh devices before trying again.':err.status?'Device save failed.':'Couldn’t confirm the device save. Retry with the same form to avoid creating a duplicate.'));}
    finally{deviceBusy=false;$('save-device-button').disabled=false;$('save-device-button').textContent='Add device';}
  }
  function newStream(){if(!device)return;$('stream-catalog').value='streams';$('stream-search').value='';$('new-stream-physical-pin').value='';$('new-stream-virtual-pin').value='';populatePresets('new-stream-preset','','temperature',true);$('custom-stream-type').value='number';$('custom-stream-min').value='0';$('custom-stream-max').value='100';streamFields();message('stream-error','');$('stream-dialog').showModal();}
  async function saveStream(event){
    event.preventDefault();if(streamBusy||!device)return;stopLive();const ctx=context(),target=device,key=$('new-stream-preset').value;
    if(key.startsWith('control:')){try{$('stream-dialog').close();await createControlStream('',target.id,key.slice(8));}catch(e){message('lab-error',e.message);}return;}
    streamBusy=true;$('save-stream-button').disabled=true;message('stream-error','');
    try{
      const module=ESP32_MODULES.find(m=>'esp32:'+m.key===key),keys=module?module.streams:[key],mapping=keys.length===1?normalizePinMapping({physical_pin:$('new-stream-physical-pin').value,virtual_pin:$('new-stream-virtual-pin').value},target.board_model,{channel_key:keys[0]}):null;let first=null,count=0;if(mapping)await checkPinAlias(target,mapping,channels.find(c=>c.channel_key===keys[0])?.id);if(!current(ctx))return;
      for(const streamKey of keys){
        let row;try{row=await ensureChannel(target,streamKey,mapping);}catch(err){if(count)err.streamPartial=count+' of '+keys.length+' streams are ready. Retry this profile to reuse them and finish setup. ';throw err;}
        if(!current(ctx))return;if(!channels.some(ch=>ch.id===row.id))channels.push(row);first=first||row.id;count++;renderChannels(first);
      }
      $('stream-dialog').close();message('lab-error','');message('lab-notice',module?module.title+' profile ready · '+keys.length+' stream'+(keys.length===1?'':'s')+'. These are data templates; hardware is not paired.':'Sensor stream is ready.');await loadReadings();
    }catch(err){if(current(ctx)){message('stream-error',(err.streamPartial||'')+(err.status?friendlyError(err,'Couldn’t add the sensor stream. Try again; an existing stream will be reused.'):err.message||'Couldn’t add the stream.'));if(err.streamPartial){readings=[];renderReadings();if(channel)await loadReadings();}}}
    finally{streamBusy=false;$('save-stream-button').disabled=false;}
  }
  async function loadReadings(){
    if(!device||!channel)return;const ctx=context(),c=channel,version=++dataVersion;
    const hours=Number($('range-select').value)||24,since=new Date(Date.now()-hours*3600000).toISOString();
    readingState='loading';renderReadiness();show('readings-loading');$('refresh-data-button').disabled=true;
    try{
      const rows=assertRows(await request('/rest/v1/telemetry?select=id,channel_id,value_num,value_bool,value_text,recorded_at,received_at,quality&channel_id=eq.'+encodeURIComponent(c.id)+'&recorded_at=gte.'+encodeURIComponent(since)+'&order=recorded_at.desc,id.desc&limit=100',{authenticated:true}));
      if(!current(ctx)||version!==dataVersion||channel?.id!==c.id)return;
      readingState='ready';readings=rows.slice().reverse();renderReadings();
    }catch(err){if(current(ctx)&&version===dataVersion){readingState='error';readings=[];renderReadings();message('lab-error',friendlyError(err,'Couldn’t load readings. Use Refresh in Sensor data to try again.'));}}
    finally{if(current(ctx)&&version===dataVersion){show('readings-loading',false);$('refresh-data-button').disabled=false;}}
  }
  function validReadings(){return validStreamReadings(readings,channel?.value_type||'number');}
  function displayValue(n){return channel?.channel_key==='pot_raw'?Math.round(n).toLocaleString():Number(n.toFixed(1)).toLocaleString(undefined,{maximumFractionDigits:1});}
  function svgElement(name,attrs={},text){const node=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;return node;}
  function renderReadings(){
    renderReadiness();
    const valid=validReadings();$('chart-container').replaceChildren();
    const labels=channel?.value_type==='boolean'?['On samples','Off samples','On share']:channel?.value_type==='text'?['Samples','Characters','Latest quality']:['Minimum','Average','Maximum'];
    ['reading-min-label','reading-mean-label','reading-max-label'].forEach((id,i)=>$(id).textContent=labels[i]);
    for(const id of ['reading-latest','reading-min','reading-mean','reading-max'])$(id).textContent='—';
    $('export-readings-button').disabled=!readings.length;
    if(!valid.length){
      const p=document.createElement('p');p.className='chart-empty';p.textContent=channel?(isSimulation(device)?'No valid readings in this time range. Run a simulated test or choose a wider range.':'No valid saved readings in this time range. Refresh after the adapter confirms a save, or choose a wider range.'):'Add a sensor stream to begin.';$('chart-container').append(p);$('reading-summary').textContent=readings.length?'No valid samples. Invalid and stale samples are excluded.':'No stored readings yet.';return;
    }
    if(channel?.value_type!=='number'){
      const latest=valid.at(-1),type=channel.value_type,value=streamValue(latest,type);
      $('reading-latest').textContent=type==='boolean'?(value?'On':'Off'):String(value).slice(0,200);
      const on=valid.filter(r=>r.value_bool===true).length;
      $('reading-min').textContent=String(type==='boolean'?on:valid.length);$('reading-mean').textContent=String(type==='boolean'?valid.length-on:value.length);$('reading-max').textContent=type==='boolean'?Math.round(on/valid.length*100)+'%':latest.quality;
      const table=document.createElement('table');table.className='stream-history-table';const caption=document.createElement('caption');caption.textContent='Latest 12 saved '+(type==='boolean'?'on / off':'text')+' readings';table.append(caption);
      const head=document.createElement('tr');for(const text of ['Recorded','Value','Quality']){const th=document.createElement('th');th.textContent=text;th.scope='col';head.append(th);}const thead=document.createElement('thead');thead.append(head);table.append(thead);const body=document.createElement('tbody');
      for(const row of valid.slice(-12).reverse()){const tr=document.createElement('tr');for(const text of [dateTime(row.recorded_at),type==='boolean'?(row.value_bool?'On':'Off'):String(row.value_text).slice(0,2000),row.quality]){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);}table.append(body);$('chart-container').append(table);
      $('reading-summary').textContent=`Latest ${readings.length} stored readings · ${valid.length} valid · ${valid.filter(r=>r.quality==='estimated').length} estimated. Numeric analytics apply to number streams.`;return;
    }
    const values=valid.map(r=>r.value_num),lo=Math.min(...values),hi=Math.max(...values),mean=values.reduce((a,b)=>a+b,0)/values.length;
    const unit=channel?.unit?' '+channel.unit:'';
    $('reading-latest').textContent=displayValue(values.at(-1))+unit;$('reading-min').textContent=displayValue(lo);$('reading-mean').textContent=displayValue(mean);$('reading-max').textContent=displayValue(hi);
    const estimated=valid.filter(r=>r.quality==='estimated').length;
    $('reading-summary').textContent=`Latest ${readings.length} stored readings · ${valid.length} valid${estimated?' · '+estimated+' estimated':''}. Min / average / max in ${channel?.unit||'stream units'}.`;
    const width=520,height=190,left=38,right=14,top=16,bottom=31;
    const lower=lo===hi?lo-1:lo-(hi-lo)*.12,upper=lo===hi?hi+1:hi+(hi-lo)*.12;
    const t0=Date.parse(valid[0].recorded_at),t1=Date.parse(valid.at(-1).recorded_at);
    const x=t=>t1===t0?width/2:left+(t-t0)/(t1-t0)*(width-left-right);
    const y=n=>top+(upper-n)/(upper-lower)*(height-top-bottom);
    const svg=svgElement('svg',{viewBox:`0 0 ${width} ${height}`,class:'sensor-chart',role:'img','aria-label':`${channel?.title||'Sensor'}: ${valid.length} stored samples, minimum ${displayValue(lo)}, average ${displayValue(mean)}, maximum ${displayValue(hi)} ${channel?.unit||''}. Lines connect stored samples.`});
    for(let i=0;i<4;i++){const value=lower+(upper-lower)*i/3;svg.append(svgElement('line',{x1:left,y1:y(value),x2:width-right,y2:y(value),stroke:'#e6eeee','stroke-width':1}));svg.append(svgElement('text',{x:0,y:y(value)+3,class:'chart-time'},displayValue(value)));}
    let path='',pen=false;
    // Invalid/stale records break the path rather than becoming zero-valued points.
    for(const row of readings){
      if(!valid.includes(row)){pen=false;continue;}
      path+=(pen?' L':' M')+x(Date.parse(row.recorded_at)).toFixed(2)+' '+y(row.value_num).toFixed(2);pen=true;
    }
    svg.append(svgElement('path',{d:path,fill:'none',stroke:'#007f79','stroke-width':2.2,'stroke-linejoin':'round'}));
    for(const row of valid)svg.append(svgElement('circle',{cx:x(Date.parse(row.recorded_at)),cy:y(row.value_num),r:2.3,fill:'#007f79'}));
    const time=t=>new Date(t).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
    svg.append(svgElement('text',{x:left,y:height-7,class:'chart-time'},time(t0)));svg.append(svgElement('text',{x:width-right,y:height-7,'text-anchor':'end',class:'chart-time'},time(t1)));$('chart-container').append(svg);
  }
  async function runTest(){
    if(runBusy||!device||!channel||channel.direction==='output'||!isSimulation(device)||liveActive||!['number','boolean','text'].includes(channel.value_type))return;
    const ctx=context(),target=device,c=channel,key=c.id;
    let run=pendingRuns.get(key);
    if(!run){
      const id=uuid(),now=Date.now();
      const rows=Array.from({length:12},(_,i)=>({id:uuid(),channel_id:c.id,...simulatedValue(c,i),recorded_at:new Date(now-(11-i)*60000).toISOString(),quality:'estimated'}));
      run={id,rows,eventId:uuid(),warningId:uuid()};pendingRuns.set(key,run);
    }
    runBusy=true;updateRunButton();message('lab-error','');message('lab-notice','');
    try{
      await request('/rest/v1/telemetry?on_conflict=id',{method:'POST',authenticated:true,prefer:'resolution=ignore-duplicates,return=minimal',body:run.rows});
      if(!current(ctx))return;
      const log=[{id:run.eventId,device_id:target.id,event_type:'simulation_completed',severity:'info',title:`Saved 12 simulated ${c.title.toLowerCase()} readings`,detail:{source:'simulation',run_id:run.id,channel_id:c.id,sample_count:12}}];
      if(c.channel_key==='temperature'&&run.rows.some(r=>r.value_num>32))log.push({id:run.warningId,device_id:target.id,event_type:'simulation_threshold_demo',severity:'warning',title:'Demo warning: simulated temperature exceeded 32 C',detail:{source:'simulation',run_id:run.id,channel_id:c.id,threshold:32}});
      let logged=true;try{await recordEvents(log);}catch{logged=false;}
      if(!current(ctx))return;
      if(logged)pendingRuns.delete(key);
      message('lab-notice',logged?'12 simulated readings saved. Your sensor history and event log now show this test run.':'Readings saved, but the test event could not be recorded. Run the test again to retry the same batch without duplicating readings.');
      await Promise.all([loadReadings(),loadEvents()]);
    }catch(err){if(current(ctx))message('lab-error',friendlyError(err,'The test save could not be confirmed. Run the test again to retry the same batch without duplicating readings.'));}
    finally{runBusy=false;updateRunButton();}
  }
  function stopLive(text='One generated reading every 5 seconds while Devices & data or Dashboard stays open.'){
    liveActive=false;liveVersion++;clearTimeout(liveTimer);liveTimer=null;$('live-stream-status').textContent=text;updateRunButton();
  }
  async function toggleLive(){if(channel?.direction==='output')return;
    if(liveActive){stopLive('Live simulation stopped. Saved readings remain in your database.');return;}
    if(!isSimulation(device)||!channel||runBusy||!getSession()||document.hidden)return;
    liveActive=true;const ctx=context(),c=channel,version=++liveVersion;updateRunButton();
    async function sample(){
      if(!liveActive||version!==liveVersion||!current(ctx)||channel?.id!==c.id||document.hidden)return;
      $('live-stream-status').textContent='SIMULATED · Saving a generated reading…';
      let row=pendingLive.get(c.id);if(!row){row={id:uuid(),channel_id:c.id,...simulatedValue(c,liveIndex++),recorded_at:new Date().toISOString(),quality:'estimated'};pendingLive.set(c.id,row);}
      try{
        await request('/rest/v1/telemetry?on_conflict=id',{method:'POST',authenticated:true,prefer:'resolution=ignore-duplicates,return=minimal',body:[row]});if(pendingLive.get(c.id)?.id===row.id)pendingLive.delete(c.id);
        if(!liveActive||version!==liveVersion||!current(ctx))return;
        await loadReadings();if(!liveActive||version!==liveVersion||!current(ctx))return;
        if(dashboard.isActive())await dashboard.refreshData();if(!liveActive||version!==liveVersion||!current(ctx))return;
        $('live-stream-status').textContent='SIMULATED · Last sample saved '+new Date(row.recorded_at).toLocaleTimeString()+'. Next sample in 5 seconds.';
        liveTimer=setTimeout(sample,5000);
      }catch(err){if(version!==liveVersion||!current(ctx))return;stopLive('Simulation paused. Start again to retry the same sample safely.');message('lab-error',friendlyError(err,'The live sample could not be confirmed. Start again to retry.'));}
    }
    await sample();
  }
  function dateTime(v){const d=new Date(v);return Number.isNaN(d.getTime())?'Time unavailable':d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
  async function loadEvents(){
    if(!device)return;const ctx=context(),target=device,version=++eventVersion;
    show('events-loading');$('refresh-events-button').disabled=true;
    try{
      const rows=assertRows(await request('/rest/v1/events?select=id,device_id,event_type,severity,title,detail,occurred_at,received_at,acknowledged_at&device_id=eq.'+encodeURIComponent(target.id)+'&order=occurred_at.desc,id.desc&limit=50',{authenticated:true}));
      if(!current(ctx)||version!==eventVersion)return;events=rows;renderEvents();
    }catch(err){if(current(ctx)&&version===eventVersion){events=[];renderEvents();$('events-empty').textContent='Couldn’t load events. Use Refresh to try again.';message('lab-error',friendlyError(err,'Couldn’t load the event log.'));}}
    finally{if(current(ctx)&&version===eventVersion){show('events-loading',false);$('refresh-events-button').disabled=false;}}
  }
  function renderEvents(){
    $('event-list').replaceChildren();show('events-empty',!events.length);$('events-empty').textContent=isSimulation(device)?'No events for this device yet. Run a sensor test to record one.':'No saved events for this device yet.';
    for(const event of events){
      const row=document.createElement('div');row.className='event-row';
      const symbol=document.createElement('span');symbol.className='event-symbol'+(event.severity==='info'?'':' warning');symbol.textContent=event.severity==='info'?'✓':'!';symbol.setAttribute('aria-hidden','true');
      const copy=document.createElement('div');copy.className='event-copy';
      const title=document.createElement('strong');title.textContent=event.title;
      const meta=document.createElement('p');
      const source=device?.label||'Device',state=event.acknowledged_at?'Acknowledged '+dateTime(event.acknowledged_at):event.severity==='info'?'Recorded':'Open';
      meta.textContent=[source,dateTime(event.occurred_at),event.severity,state].join(' · ');
      if(event.detail?.source==='simulation'){const tag=document.createElement('span');tag.className='event-tag';tag.textContent='SIMULATED';meta.append(tag);}
      if(event.detail?.mode==='manual_replay'){const tag=document.createElement('span');tag.className='event-tag';tag.textContent=event.detail.source==='hardware'?'HARDWARE REPLAY':'HISTORICAL RULE TEST';meta.append(tag);if(Number.isFinite(Date.parse(event.detail.observed_at))){const observed=document.createElement('small');observed.className='event-observed';observed.textContent='Observed '+dateTime(event.detail.observed_at)+(event.detail.quality?' · '+event.detail.quality:'');meta.append(observed);}}
      copy.append(title,meta);row.append(symbol,copy);
      if(event.severity!=='info'&&!event.acknowledged_at){const ack=document.createElement('button');ack.className='text-button';ack.type='button';ack.textContent='Acknowledge';ack.addEventListener('click',()=>acknowledge(event,ack));row.append(ack);}
      $('event-list').append(row);
    }
  }
  async function acknowledge(event,button){
    const ctx=context();button.disabled=true;
    try{
      const now=new Date().toISOString();
      const rows=assertRows(await request('/rest/v1/events?id=eq.'+encodeURIComponent(event.id),{method:'PATCH',authenticated:true,prefer:'return=representation',body:{acknowledged_at:now}}));
      if(!current(ctx))return;if(!rows[0])throw new Error('Acknowledgment not confirmed');
      events=events.map(e=>e.id===event.id?{...e,acknowledged_at:rows[0].acknowledged_at}:e);renderEvents();
    }catch(err){if(current(ctx)){message('lab-error',friendlyError(err,'Couldn’t acknowledge this event. Try again.'));button.disabled=false;}}
  }
  function csvCell(value){let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  function exportReadings(){
    if(!device||!channel||!readings.length)return;
    const lines=[['device','stream','unit','value','recorded_at_utc','received_at_utc','quality','device_mode'].map(csvCell).join(',')];
    for(const row of readings)lines.push([csvCell(device.label),csvCell(channel.title),csvCell(channel.unit),channel.value_type==='number'?(typeof row.value_num==='number'&&Number.isFinite(row.value_num)?String(row.value_num):''):csvCell(streamValue(row,channel.value_type)),csvCell(row.recorded_at),csvCell(row.received_at),csvCell(row.quality),csvCell(isSimulation(device)?'simulation':'hardware')].join(','));
    const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='RoboSynct_readings_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function showProjectTab(view,load=true,notify=true){
    if(view==='data')view='devices';
    const base=['devices','datastreams','events'].includes(view)?'data':view;
    const changed=activeView!==view;
    activeView=view;
    $('project-workspace').dataset.view=view;
    if(!['data','dashboard'].includes(base))stopLive();
    if(view!=='dashboard')dashboard.deactivate();
    if(view!=='datastreams')directoryRun++;
    show('project-data-view',base==='data');
    show('dashboard-view',view==='dashboard');show('rules-view',view==='rules');
    show('analytics-view',view==='analytics');show('library-view',view==='library');
    show('add-device-button',view==='devices');
    show('project-connect-device',view!=='devices');
    $('project-data-view').querySelector('.device-panel').hidden=view!=='devices';
    $('project-data-view').querySelector('.sensor-panel').hidden=view!=='datastreams';
    $('project-data-view').querySelector('.events-panel').hidden=view!=='events';
    show('device-scope-row',view==='datastreams'||view==='events');
    show('stream-directory',view==='datastreams');
    for(const name of ['data','dashboard','rules','analytics','library']){
      const tab=$('project-'+name+'-tab');
      tab.setAttribute('aria-selected',String(base===name));tab.tabIndex=base===name?0:-1;
    }
    if(notify&&project)publishView(view);
    if(load&&project){
      if(view==='datastreams')return refreshDirectory();
      if(view==='events')return loadEvents();
      if(view==='devices'&&changed){renderDevices();return;}
      if(view==='dashboard')return dashboard.open(project,devices);
      if(view==='rules')return ruleBuilder.open(project,devices);
      if(view==='analytics')return analytics.open(project,devices);
      if(view==='library')return library.open(project,devices);
    }
  }
  function canLeave(){
    if(isDeleting()){message('lab-notice','Please wait for the deletion check to finish.');return false;}
    if(library.hasPendingChanges()){showProjectTab('library',false);library.warnBeforeLeave();return false;}
    if(dashboard.hasPendingChanges()){showProjectTab('dashboard',false);dashboard.warnBeforeLeave();return false;}
    if(ruleBuilder.hasPendingChanges()){showProjectTab('rules',false);ruleBuilder.warnBeforeLeave();return false;}
    return true;
  }
  for(const name of ['data','dashboard','rules','analytics','library'])$('project-'+name+'-tab').addEventListener('click',()=>showProjectTab(name));
  const tabs=['data','dashboard','rules','analytics','library'];
  for(const name of tabs)$('project-'+name+'-tab').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const index=tabs.indexOf(name),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
    $('project-'+tabs[next]+'-tab').focus();showProjectTab(tabs[next]);
  });
  $('back-to-projects').addEventListener('click',()=>{if(canLeave())reset();});
  $('workspace-nav').addEventListener('click',event=>{event.preventDefault();if(canLeave())reset();});
  $('delete-device-button').addEventListener('click',()=>{
    if(!project||!device||!onDeleteDevice||deviceBusy||streamBusy||runBusy||!canLeave())return;
    stopLive();const ctx=context(),target=device,deletedChannels=channels.map(c=>c.id);
    onDeleteDevice({kind:'device',id:target.id,name:target.label,projectId:project.id,onDeleted:async()=>{
      if(!alive(ctx.v,ctx.g))return;dashboard.reset();ruleBuilder.reset();analytics.reset();deviceVersion++;dataVersion++;eventVersion++;channels=[];channel=null;readings=[];events=[];
      for(const id of deletedChannels){pendingRuns.delete(id);pendingLive.delete(id);}$('event-list').replaceChildren();renderReadings();show('sensor-content',false);show('sensor-empty');$('events-empty').textContent='Choose a device to view its events.';show('events-empty');await loadDevices();message('lab-notice','Device deleted. Its sensor streams, readings, and events were removed.');
    }});
  });
  $('project-info-button').addEventListener('click',()=>$('details-dialog').showModal());
  $('refresh-devices-button').addEventListener('click',()=>loadDevices());
  $('device-search').addEventListener('input',renderDevices);$('device-filter-mode').addEventListener('change',renderDevices);$('device-filter-group').addEventListener('change',renderDevices);$('device-filter-status').addEventListener('change',renderDevices);
  $('clear-device-search').addEventListener('click',()=>{$('device-search').value='';$('device-filter-mode').value='all';$('device-filter-group').value='';$('device-filter-status').value='all';renderDevices();$('device-search').focus();});
  $('device-form').addEventListener('submit',saveDevice);$('stream-form').addEventListener('submit',saveStream);
  $('stream-pin-setup').addEventListener('click',openPinSetup);$('stream-pin-form').addEventListener('submit',savePinSetup);for(const id of ['stream-physical-pin','stream-virtual-pin'])$(id).addEventListener('input',pinPreview);$('stream-physical-pin').addEventListener('change',pinPreview);$('stream-pin-dialog').addEventListener('close',()=>{if(!$('stream-pin-dialog').open)pinTarget=null;});
  let hardwareDialog=null;
  $('add-hardware-stream-button').addEventListener('click',()=>{
    if(!project||!getSession()||hardwareDialog?.open)return;
    const ctx=context();
    hardwareDialog=openHardwareSetup({devices,deviceId:device?.id,request,current:()=>current(ctx),
      onReady:async({profile,device:target,catalog,streams})=>{
        if(!current(ctx))return;
        if(target.id===device?.id){channels=catalog;readings=[];renderChannels(streams[0].id);renderReadings();await loadReadings();}
        message('lab-notice',profile==='camera'?'ESP32-CAM snapshot stream is ready.':profile+' pin streams are ready.');
      }});
  });
  $('add-control-stream-button').addEventListener('click',()=>createControlStream().catch(e=>message('lab-error',e.message)));
  $('device-scope').addEventListener('change',()=>{
    const selected=devices.find(row=>row.id===$('device-scope').value);
    if(selected)selectDevice(selected);
  });
  $('directory-search').addEventListener('input',renderDirectory);
  $('add-stream-button').addEventListener('click',newStream);$('run-test-button').addEventListener('click',runTest);
  $('refresh-data-button').addEventListener('click',()=>{loadReadings();if(activeView==='datastreams')refreshDirectory();});$('refresh-events-button').addEventListener('click',loadEvents);
  $('range-select').addEventListener('change',loadReadings);
  $('stream-select').addEventListener('change',()=>{closeUsbBinding();stopLive();channel=channels.find(c=>c.id===$('stream-select').value)||null;readings=[];renderReadings();updateRunButton();loadReadings();});
  populatePresets('device-sensor');populatePresets('new-stream-preset','','temperature',true);
  $('stream-search').addEventListener('input',()=>{populatePresets('new-stream-preset',$('stream-search').value,$('new-stream-preset').value,true);streamFields();});
  $('stream-catalog').addEventListener('change',()=>{populatePresets('new-stream-preset',$('stream-search').value,$('new-stream-preset').value,true);streamFields();});
  $('new-stream-preset').addEventListener('change',streamFields);$('custom-stream-type').addEventListener('change',streamFields);
  $('dashboard-stop-stream').addEventListener('click',()=>stopLive('Live simulation stopped. Saved readings remain in your database.'));
  $('live-stream-button').addEventListener('click',toggleLive);addEventListener('pagehide',()=>stopLive());document.addEventListener('visibilitychange',()=>{if(document.hidden)stopLive('Live simulation paused while this page is hidden. Select Start to resume.');});
  $('export-readings-button').addEventListener('click',exportReadings);
  $('download-usb-binding').addEventListener('click',()=>openUsbBinding(false));
  $('download-sensor-usb-binding').addEventListener('click',()=>openUsbBinding(true));
  $('usb-binding-copy').addEventListener('click',copyUsbBinding);
  for(const id of ['usb-binding-close','usb-binding-done'])$(id).addEventListener('click',closeUsbBinding);
  $('usb-binding-dialog').addEventListener('cancel',event=>{event.preventDefault();closeUsbBinding();});
  $('usb-binding-dialog').addEventListener('close',()=>{if(!$('usb-binding-dialog').open)clearUsbBinding();});
  for(const id of ['device-dialog','stream-dialog','stream-pin-dialog'])$(id).addEventListener('cancel',event=>{if(id==='device-dialog'?deviceBusy:id==='stream-pin-dialog'?pinBusy:streamBusy)event.preventDefault();});
  return {openPhoneEditor:async()=>{await showProjectTab('dashboard');dashboard.openPhoneEditor();},open,reset,canLeave,stageStarter:async(bp,target,review)=>{await dashboard.open(project,devices);await dashboard.stageExperiment(bp,target,review);showProjectTab('dashboard',false);},connectionScope:()=>({project:project?{id:project.id,name:project.name}:null,devices:devices.map(d=>({...d})),device:device?{...device}:null,channels:channels.map(c=>({...c})),streamsReady:streamState==='ready'}),selectExistingDevice:async id=>{if(!canLeave())throw new Error('Review unsaved changes first.');const target=devices.find(d=>d.id===id);if(!target)throw new Error('Device unavailable.');await selectDevice(target);},showConnectionDashboard:()=>showProjectTab('dashboard'),showExistingTab:async (name,{editEmpty=false}={})=>{
    if(!project)return false;
    if(activeView===name&&!editEmpty)return true;
    if(!canLeave())return false;
    await showProjectTab(name);
    if(editEmpty&&name==='dashboard'&&activeView===name)dashboard.editEmpty?.();
    return activeView===name;
  },registerDevice:newDevice,blocksClose:id=>id==='device-dialog'?deviceBusy:id==='stream-dialog'?streamBusy:id==='stream-pin-dialog'?pinBusy:dashboard.blocksClose(id)||library.blocksClose(id)||ruleBuilder.blocksClose(id)};
}
