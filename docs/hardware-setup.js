import { HARDWARE_PROFILES,supportsHardware,provisionHardware } from './hardware-streams.js?v=3.0.2';

function element(tag,copy,className){
  const node=document.createElement(tag);
  if(copy)node.textContent=copy;
  if(className)node.className=className;
  return node;
}

export function openHardwareSetup({devices,request,current,onReady,deviceId='',addWidget=false}){
  const dialog=element('dialog',null,'hardware-setup');
  dialog.setAttribute('aria-label',addWidget?'Add hardware widget':'Add hardware streams');
  const form=element('form');
  const heading=element('h2',addWidget?'Add hardware widget':'Add hardware streams');
  const profile=element('select'),device=element('select');
  const profileLabel=element('label','Hardware'),deviceLabel=element('label','Device');
  const help=element('p',null,'subtle'),status=element('p',null,'hardware-setup-status');
  status.setAttribute('role','status');
  const actions=element('div',null,'form-actions');
  const cancel=element('button','Cancel','button secondary'),save=element('button',
    addWidget?'Add streams and widget':'Add streams','button primary');
  cancel.type='button';save.type='submit';
  const candidates=deviceId?devices.filter(item=>item.id===deviceId):devices;
  for(const item of HARDWARE_PROFILES){
    const choice=new Option(item.label,item.id);
    choice.disabled=!candidates.some(target=>supportsHardware(item.id,target));
    profile.append(choice);
  }
  profile.value=[...profile.options].find(choice=>!choice.disabled)?.value||'';
  profileLabel.append(profile);deviceLabel.append(device);
  actions.append(cancel,save);form.append(heading,profileLabel,deviceLabel,help,status,actions);
  dialog.append(form);document.body.append(dialog);
  let busy=false;
  const alive=()=>dialog.open&&current();
  function refresh(){
    const choices=candidates.filter(target=>supportsHardware(profile.value,target));
    device.replaceChildren(...choices.map(target=>new Option(target.label,target.id)));
    profile.disabled=!profile.value;
    device.disabled=!choices.length;save.disabled=!choices.length;
    help.textContent=!choices.length?'Add an ESP32-CAM or dedicated ESP32 DevKit V1 in Devices first.':
      profile.value==='camera'?'Adds one private JPEG snapshot stream. Camera uploads are set up in Device connections.':
        'Adds six read-only pin streams with virtual labels. Use the paired Android controller for live movement.';
    status.textContent='';
  }
  profile.addEventListener('change',refresh);
  cancel.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!alive())return;
    const selected=candidates.find(target=>target.id===device.value),kind=profile.value;
    if(!selected||!supportsHardware(kind,selected))return;
    busy=true;
    profile.disabled=device.disabled=cancel.disabled=save.disabled=true;
    status.textContent='Checking existing streams…';
    try{
      const load=async()=>{
        const rows=await request('/rest/v1/channels?select=id,device_id,channel_key,title,unit,value_type,direction,config&device_id=eq.'+
          encodeURIComponent(selected.id)+'&limit=1000',{authenticated:true});
        if(!Array.isArray(rows))throw Error('Could not load the device streams.');
        return rows;
      };
      const result=await provisionHardware({profile:kind,device:selected,load,current:alive,
        write:body=>request('/rest/v1/rpc/rs_studio_write',{method:'POST',body,authenticated:true}),
        progress:(done,total)=>{status.textContent=`${done} of ${total} streams ready`;}});
      if(!alive())return;
      await onReady({profile:kind,device:selected,...result});
      if(dialog.open)dialog.close();
    }catch(error){
      status.textContent=error.message||'Could not confirm the streams. Try again to reuse the saved ones.';
    }finally{
      busy=false;cancel.disabled=false;
      profile.disabled=device.disabled=save.disabled=!alive();
    }
  });
  refresh();dialog.showModal();
  return dialog;
}
