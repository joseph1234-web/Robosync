// Read-only guide over the existing owner-scoped device/stream APIs.
export function freshGuideReading(rows,channelId,now=Date.now()) {
  if(!Array.isArray(rows))return null;
  return rows.find(r=>r?.channel_id===channelId&&typeof r.value_num==='number'&&Number.isFinite(r.value_num)&&r.value_num>=0&&r.value_num<=4095&&!['bad','invalid','stale'].includes(r.quality)&&Number.isFinite(Date.parse(r.recorded_at))&&Date.parse(r.recorded_at)<=now+2000&&now-Date.parse(r.recorded_at)<=20000)||null;
}
export function createConnectionGuide({request,getSession,getGeneration,getScope,getProjects,chooseProject,chooseDevice,newDevice,newProject,viewDashboard,showLegacyQr}) {
  const $=id=>document.getElementById(id);let version=0,step=1,busy=false,projectPick='',devicePick='',verification=null;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const snapshot=()=>getScope()||{project:null,devices:[],device:null,channels:[],streamsReady:false};
  const ctx=()=>({v:version,g:getGeneration(),project:snapshot().project?.id,device:snapshot().device?.id});
  const current=c=>!!getSession()&&c.v===version&&c.g===getGeneration()&&c.project===snapshot().project?.id&&c.device===snapshot().device?.id;
  const link=(label,href)=>{const a=el('a',label,'button secondary');a.href=href;a.target='_blank';a.rel='noopener';return a;};
  const button=(label,action,primary=false)=>{const b=el('button',label,'button '+(primary?'primary':'secondary'));b.type='button';b.addEventListener('click',()=>perform(action));return b;};
  const select=(root,label,id,rows,value)=>{const wrap=el('label',label),s=el('select');s.id=id;for(const [key,name] of rows){const o=el('option',name);o.value=key;s.append(o);}s.value=value;wrap.append(s);root.append(wrap);return s;};
  const say=text=>{$('connect-guide-message').textContent=text;};
  function close(){version++;busy=false;verification=null;$('connect-guide').close();$('connect-guide-content').replaceChildren();say('');}
  function reset(){close();step=1;projectPick=devicePick='';}
  async function perform(action){if(busy||!getSession())return;busy=true;const c=ctx();try{await action(c);}catch(error){if(current(c))say('This step could not be completed. Your existing device and history are retained. Retry or close the guide.');}finally{if(c.v===version){busy=false;controls();}}}
  function controls(){$('connect-guide-back').disabled=busy||step===1;$('connect-guide-next').disabled=busy;$('connect-guide-next').textContent=step===5?'Open Dashboard':'Next';}
  function render(){const scope=snapshot(),root=$('connect-guide-content');root.replaceChildren();const names=['Choose','Prepare','Connect','Sync options','Verify'];$('connect-guide-title').textContent='Step '+step+' of 5 · '+names[step-1];$('connect-guide-progress').textContent=names.map((n,i)=>(i+1===step?'● ':'')+(i+1)+' '+n).join('  /  ');controls();
    if(step===1){root.append(el('h3','Use your existing device'),el('p','Keep its saved streams, Dashboard and history. This guide does not create duplicate records.'));
      if(!scope.project){const rows=getProjects();if(rows.length){const s=select(root,'Project','guide-project',[['','Choose a project'],...rows.map(p=>[p.id,p.name])],projectPick);s.addEventListener('change',()=>{projectPick=s.value;});root.append(el('p','Choose a project, then Next to load its saved devices.'));}else root.append(el('p','Create your first project, then return to connect its device.'));root.append(button('Create a project',()=>{close();newProject();}));return;}
      root.append(el('p','Project: '+scope.project.name,'guide-context'));const devices=scope.devices.filter(d=>d.config?.mode!=='simulation');
      if(!devicePick&&devices.some(d=>d.id===scope.device?.id))devicePick=scope.device.id;
      const s=select(root,'Saved hardware device','guide-device',[['','Choose an existing device'],...devices.map(d=>[d.id,d.label+' · '+d.board_model])],devicePick);s.addEventListener('change',()=>{devicePick=s.value;verification=null;});
      if(!devices.length)root.append(el('p','No registered hardware in this project. Register one deliberately, then return. Simulation remains available in Devices.'));
      root.append(button('Register another device',()=>{close();newDevice();}));return;
    }
    const d=scope.device,c=scope.channels.find(c=>c.device_id===d?.id&&c.channel_key==='pot_raw'&&c.direction==='input'&&c.value_type==='number'&&c.unit==='raw');
    if(!d){root.append(el('p','Choose a saved device first.'));return;}
    const compatible=d.config?.mode==='hardware'&&['ESP32','ESP32 DevKit V1','esp32-devkit-v1'].includes(d.board_model);
    root.append(el('p',scope.project.name+' / '+d.label,'guide-context'));
    if(step===2){root.append(el('h3',compatible?'Prepare the original ESP32':'Check this board profile'),el('p',compatible?'Potentiometer: outer pins to 3.3V and GND, wiper to GPIO34. Already uploaded RoboSynct Direct? Continue.':'The current Direct starter targets the original ESP32 DevKit V1. This saved board profile is not verified compatible. Do not flash it with a different board’s sketch.'));
      if(compatible)root.append(link('Firmware + private setup QR','./easy-setup.html'),link('Direct starter 1.1.0','https://robosynct.principechristian220.chatgpt.site/downloads/RoboSynct_Direct_ESP32_Starter_1_1_0.zip'));
      root.append(el('p','Upload manually in Arduino IDE only when needed. Keep Erase All Flash disabled. Existing enrollment keys remain. Robot-car operation is deferred.'));return;
    }
    if(step===3){root.append(el('h3','Connect in the Android app'),el('p','Sign in once with the same website account. Open this project → Devices → Connect device. Choose Bluetooth or local Wi-Fi. Your enrolled board uses its saved key; a new board scans its private setup QR once.'));
      root.append(link('Get Android 1.4','./android-app.html'),link('Phone setup guide','./easy-connection.html'));root.append(el('p','The browser cannot see or verify your phone’s Bluetooth link. Network approval and Nearby devices permissions are handled by Android.'));
      root.append(button('Existing website QR connection',()=>{close();showLegacyQr();}));return;
    }
    if(step===4){root.append(el('h3','Choose website sync on your phone'),el('p','Board transport and website delivery are separate. These choices are made in the APK; this guide does not change the phone’s setting.'));
      const a=el('div',undefined,'guide-option');a.append(el('strong','Auto-sync'),el('p','Queue new readings and upload when internet is available. Temporary outages retry automatically.'));
      const b=el('div',undefined,'guide-option');b.append(el('strong','Local only'),el('p','Keep local collection and enabled queuing, with website traffic paused until you resume.'));
      root.append(a,b,el('p','Current cloud path: ESP32 → phone (or laptop USB bridge) → website. Router settings alone do not add a standalone cloud uploader.'));return;
    }
    root.append(el('h3','Check a saved upload'),el('p','Turn the knob on the phone, choose Auto-sync if you want website delivery, then check this existing stream. Local-only readings can remain queued.'));
    if(!scope.streamsReady)root.append(el('p','Saved streams could not be verified. Retry the device in Devices before checking uploads.'));
    else if(!c)root.append(el('p','No compatible pot_raw numeric input is saved for this device. Add that stream through the existing device tools; no channel is created automatically.'));
    else root.append(button('Check latest saved reading',async target=>{say('Checking this stream under your existing account…');const rows=await request('/rest/v1/telemetry?select=id,channel_id,value_num,quality,recorded_at&channel_id=eq.'+encodeURIComponent(c.id)+'&order=recorded_at.desc&limit=1',{authenticated:true});if(!current(target))return;const row=freshGuideReading(rows,c.id);verification=row?{value:row.value_num,at:row.recorded_at}:null;say(row?'Recent saved upload found: '+row.value_num+' raw · '+new Date(row.recorded_at).toLocaleString()+'. This confirms stored data, not the current radio link.':'No fresh saved upload yet. Check Auto-sync and internet on the phone, or continue using local readings.');},true));
    if(verification)root.append(el('p','Previously verified upload: '+verification.value+' raw · '+new Date(verification.at).toLocaleString()+'. Check again to confirm freshness.'));
    root.append(el('p','Opening the Dashboard does not mark an unverified board as connected. Existing values and bindings remain.'));
  }
  async function next(c){const scope=snapshot();if(step===1){if(!scope.project){const p=getProjects().find(p=>p.id===projectPick);if(!p){say('Choose an existing project first.');return;}await chooseProject(p);if(c.v!==version||c.g!==getGeneration())return;devicePick='';render();return;}if(!scope.devices.some(d=>d.id===devicePick&&d.config?.mode!=='simulation')){say('Choose an existing hardware device first.');return;}await chooseDevice(devicePick);if(c.v!==version||c.g!==getGeneration())return;}
    if(step===5){close();await viewDashboard();return;}
    step=Math.min(5,step+1);say('');render();
  }
  async function open(){if(!getSession())return;version++;step=1;busy=false;projectPick=devicePick='';verification=null;say('');$('connect-guide').showModal();render();}
  $('connect-guide-next').addEventListener('click',()=>perform(next));$('connect-guide-back').addEventListener('click',()=>{if(!busy){step=Math.max(1,step-1);verification=null;say('');render();}});$('connect-guide-close').addEventListener('click',close);$('connect-guide').addEventListener('cancel',e=>{e.preventDefault();close();});
  return {open,reset};
}
