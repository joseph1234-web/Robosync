import { sensorBoard, SENSOR_BOARD_PROFILES } from './sensor-boards.js?v=0.36.1';
import { deviceReport, inventoryDate, latestReading } from './device-inventory.js?v=3.0.0';

export function freshGuideReading(rows,channelId,now=Date.now()) {
  return (rows||[]).find(row=>row.channel_id===channelId&&['ok','estimated'].includes(row.quality)&&Number.isFinite(row.value_num)&&Number.isFinite(Date.parse(row.recorded_at))&&Date.parse(row.recorded_at)<=now+2000&&now-Date.parse(row.recorded_at)<=120000)||null;
}

const steps=['Choose board','Select connection','Configure','Verify','Finish'];
const methods={
  cloud:['Cloud over router Wi-Fi','Use the board’s cloud configuration and router internet.','Set up sensor uploads'],
  usb:['USB bridge','Use the laptop bridge with the matching board sketch and a sensor binding.','USB bridge instructions'],
  ble:['Bluetooth with Android','Pair from Devices in the Android app. Enable Auto-sync to send readings to the website.','Open Android setup'],
  wifi:['Local Wi-Fi or hotspot','Connect to the board from the Android app. Auto-sync needs internet when the phone uploads.','Open Android setup']
};
const registration={1:'ESP32',2:'ESP32-S3 DevKitC-1',3:'ESP32-C3 DevKitM-1',4:'Arduino Uno R3'};

export function createConnectionGuide({request,getSession,getGeneration,getScope,getProjects,chooseProject,chooseDevice,newDevice,newProject,viewDashboard,showLegacyQr,simulateDevice}) {
  const $=id=>document.getElementById(id),dialog=$('connect-guide');
  let version=0,step=0,busy=false,projectPick='',boardPick='',devicePick='',method='',verification='';
  const element=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  const message=text=>{$('connect-guide-message').textContent=text;};
  const current=(turn,generation)=>turn===version&&generation===getGeneration()&&!!getSession();
  const selected=()=>getScope().devices.find(device=>device.id===devicePick);
  const board=()=>sensorBoard(selected()?.board_model||boardPick);
  const available=()=>{
    const profile=board();
    if(!profile)return [];
    if(profile.id===4)return ['usb'];
    if(profile.id===1)return ['cloud','usb','ble','wifi'];
    return ['usb','ble','wifi'];
  };

  function close(){
    version++;busy=false;verification='';
    if(dialog.open)dialog.close();
    $('connect-guide-content').replaceChildren();
    message('');
  }

  function controls(){
    $('connect-guide-back').disabled=busy||step===0;
    $('connect-guide-next').disabled=busy;
    $('connect-guide-next').textContent=step===4?'Open dashboard':'Continue';
  }

  async function perform(action){
    if(busy||!getSession())return;
    const turn=version,generation=getGeneration();
    busy=true;controls();
    try{await action(turn,generation);}
    catch{if(current(turn,generation))message('This check is unavailable. Try again.');}
    finally{if(current(turn,generation)){busy=false;controls();}}
  }

  function button(root,label,fn){
    const node=element('button',label,'button secondary');
    node.type='button';
    node.addEventListener('click',()=>perform(fn));
    root.append(node);
  }

  function link(root,label,href){
    const node=element('a',label,'button secondary');
    node.href=href;
    node.target='_blank';
    node.rel='noopener';
    root.append(node);
  }

  function selector(root,title,items,value,changed){
    const label=element('label',title),select=element('select');
    for(const [key,text] of items)select.append(new Option(text,key));
    select.value=value;
    select.addEventListener('change',()=>changed(select.value));
    label.append(select);
    root.append(label);
    return select;
  }

  function render(){
    const root=$('connect-guide-content'),scope=getScope(),devices=scope.devices.filter(device=>device.config?.mode!=='simulation');
    root.replaceChildren();
    $('connect-guide-title').textContent=steps[step];
    $('connect-guide-progress').textContent=steps.map((label,index)=>index===step?'['+label+']':label).join('  /  ');
    controls();
    if(step===0){
      if(!scope.project){
        selector(root,'Project',[['','Choose project'],...getProjects().map(project=>[project.id,project.name])],projectPick,value=>{projectPick=value;});
        if(!getProjects().length)button(root,'Create project',()=>{close();newProject();});
      }else{
        const choices=[['','Choose a board'],...devices.map(device=>[device.id,device.label+' · '+device.board_model]),...SENSOR_BOARD_PROFILES.map(profile=>[profile.key,'New '+profile.name])];
        selector(root,'Saved device or new board',choices,devicePick||boardPick,value=>{
          devicePick=devices.some(device=>device.id===value)?value:'';
          boardPick=devicePick?'':value;
          method='';
        });
        button(root,'Add simulated device',()=>{close();simulateDevice();});
      }
    }else if(step===1){
      selector(root,'Connection',available().map(key=>[key,methods[key][0]]),method,value=>{method=value;render();});
      if(method)root.append(element('p',methods[method][1]));
    }else if(step===2){
      const url=method==='cloud'
        ? './studio.html?project='+encodeURIComponent(scope.project.id)+'&tab=cloud&device='+encodeURIComponent(devicePick)
        : method==='usb'?'./usb-sensor.html':'./easy-connection.html';
      if(!selected()){
        root.append(element('p','Save a device profile for your '+board().name+' before linking it.'));
        button(root,'Register board',()=>{
          const model=registration[board().id],generation=getGeneration(),turn=version;
          dialog.close();
          newDevice({board:model,hardware:true,onSaved:device=>{
            if(!current(turn,generation))return;
            devicePick=device.id;
            boardPick='';
            if(!dialog.open)dialog.showModal();
            render();
          }});
        });
      }else{
        root.append(element('p',selected().label+' · '+methods[method][0],'guide-context'),element('p',methods[method][1]));
        link(root,methods[method][2],url);
        if(method==='ble'||method==='wifi')button(root,'Open Phone Sync',()=>{close();return showLegacyQr();});
      }
    }else if(step===3){
      root.append(element('p',method==='cloud'?'Check for a confirmed upload from the configured board.':'Save a reading through the selected connection, then check that the website received it.'));
      button(root,'Check saved data',verify);
      if(verification)root.append(element('p',verification));
    }else{
      root.append(element('p',verification||'You can open the dashboard while the board completes setup.'));
    }
  }

  async function verify(turn,generation){
    const scope=getScope(),target=scope.device;
    if(target?.id!==devicePick)return;
    message('Checking recent reports…');
    if(method==='cloud'){
      const status=await request('/rest/v1/rpc/rs_io_device_status',{method:'POST',authenticated:true,body:{p_device:target.id}});
      const report=deviceReport(target,status);
      verification=report.lastUpload
        ? 'Last confirmed sensor upload · '+inventoryDate(report.lastUpload)+'. Control contact · '+inventoryDate(report.controlContact)+'.'
        : 'No confirmed cloud upload yet.';
    }else{
      const streams=scope.channels.filter(channel=>channel.direction==='input');
      let latest=null;
      for(const channel of streams){
        if(!current(turn,generation)||getScope().device?.id!==target.id)return;
        const rows=await request('/rest/v1/telemetry?select=id,channel_id,value_num,value_bool,value_text,quality,recorded_at&channel_id=eq.'+encodeURIComponent(channel.id)+'&order=recorded_at.desc&limit=12',{authenticated:true});
        const sample=latestReading(channel,rows);
        if(sample&&(!latest||Date.parse(sample.time)>Date.parse(latest.time)))latest=sample;
      }
      verification=latest ? 'Last saved reading · '+latest.value+' · '+inventoryDate(latest.time)+(latest.recent?'':' · stored history') : 'No saved reading available yet.';
    }
    if(!current(turn,generation)||getScope().device?.id!==target.id)return;
    message('');render();
  }

  async function next(turn,generation){
    const scope=getScope();
    if(step===0&&!scope.project){
      const project=getProjects().find(row=>row.id===projectPick);
      if(!project){message('Choose or create a project.');return;}
      await chooseProject(project);
      if(current(turn,generation)){message('');render();}
      return;
    }
    if(step===0){
      if(!board()){message('Choose a supported board.');return;}
      if(devicePick&&scope.device?.id!==devicePick)await chooseDevice(devicePick);
      method=available()[0];
    }
    if(step===2&&!selected()){message('Register this board first.');return;}
    if(step===4){close();await viewDashboard();return;}
    if(current(turn,generation)){step++;message('');render();}
  }

  function open(){
    if(!getSession()||dialog.open)return;
    version++;step=0;busy=false;projectPick=boardPick='';method=verification='';
    const scope=getScope();
    devicePick=scope.device?.config?.mode!=='simulation'?scope.device?.id||'':'';
    dialog.showModal();render();
  }

  $('connect-guide-next').addEventListener('click',()=>perform(next));
  $('connect-guide-back').addEventListener('click',()=>{if(!busy&&step>0){step--;verification='';message('');render();}});
  $('connect-guide-close').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  return {open,reset:close};
}
