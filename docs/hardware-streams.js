import { ioBoardKey,streamDescriptor } from './stream-contract.js?v=0.36.1';

export const HARDWARE_PROFILES=[
  {id:'camera',label:'ESP32-CAM',board:'esp32-cam-ai-thinker'},
  {id:'L298N',label:'L298N motor driver',board:'esp32-devkit-v1'},
  {id:'L293D',label:'L293D motor driver',board:'esp32-devkit-v1'}
];
const SIGNALS=['ENA','IN1','IN2','IN3','IN4','ENB'];
const GPIO=[25,27,32,33,23,26];
const L293D_PINS=['1 · 1,2EN','2 · 1A','7 · 2A','10 · 3A','15 · 4A','9 · 3,4EN'];
const CAMERA_KEY='camera_snapshot';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function supportsHardware(profile,device){
  const definition=HARDWARE_PROFILES.find(item=>item.id===profile);
  return !!definition&&ioBoardKey(device?.board_model)===definition.board&&device.config?.mode!=='simulation';
}

export function motorPins(profile){
  return SIGNALS.map((signal,index)=>({
    signal,gpio:GPIO[index],pin:profile==='L293D'?L293D_PINS[index]:signal,
    key:'motor_'+signal.toLowerCase(),pwm:index===0||index===5
  }));
}

export function motorStreamProfile(row,device){
  const io=row?.config?.io,profile=io?.motor_driver;
  if(!UUID.test(row?.id||'')||row.device_id!==device?.id||!['L298N','L293D'].includes(profile)||
     !supportsHardware(profile,device)||row.direction!=='input'||io.kind!=='status'||io.version!==1)return '';
  const pin=motorPins(profile).find(item=>item.signal===io.motor_signal);
  const type=pin?.pwm?'number':'boolean';
  return pin&&row.channel_key===pin.key&&row.value_type===type&&io.type===type&&
    row.config.physical_pin==='GPIO'+pin.gpio?profile:'';
}

export function cameraMediaId(row,device){
  try{
    const descriptor=streamDescriptor(row,device);
    return supportsHardware('camera',device)&&descriptor.kind==='media'?descriptor.media_id:'';
  }catch{return '';}
}

export function hardwareStreamPlan(profile,device,rows,uuid=()=>crypto.randomUUID()){
  if(!UUID.test(device?.id||'')||!supportsHardware(profile,device))throw Error('Choose a matching hardware device.');
  const current=rows.filter(row=>row.device_id===device.id);
  const newRow=(channel_key,title,value_type,unit,config)=>({
    device_id:device.id,channel_key,title,value_type,unit,direction:'input',config
  });
  if(profile==='camera'){
    const named=current.find(row=>row.channel_key===CAMERA_KEY);
    const retained=named&&cameraMediaId(named,device)?named:
      current.filter(row=>cameraMediaId(row,device)).sort((a,b)=>a.channel_key.localeCompare(b.channel_key))[0];
    if(retained)return [{row:retained,create:false}];
    if(named)throw Error('The camera_snapshot key is already used. Select a different camera device.');
    return [{create:true,row:newRow(CAMERA_KEY,'ESP32-CAM snapshot','text','',{
      virtual_pin:'',physical_pin:'',io:{version:1,kind:'media',type:'media',history:false,
        media_id:uuid(),source_mode:'snapshot',formats:['image/jpeg'],aspect_ratio:4/3,profile:'esp32-cam-ai-thinker'}
    })}];
  }

  const profilePins=motorPins(profile);
  const names=new Set(profilePins.map(pin=>pin.key));
  const occupied=new Set(current.map(row=>row.config?.virtual_pin));
  const reserved=new Set(profilePins.map(pin=>pin.gpio));
  for(const row of current){
    if(names.has(row.channel_key)){
      if(motorStreamProfile(row,device)!==profile)throw Error('This device already uses a different motor stream mapping.');
    }else{
      const gpio=Number(/^GPIO(\d+)$/.exec(row.config?.physical_pin||'')?.[1]);
      const rgb=row.config?.io?.rgb_pins;
      if(reserved.has(gpio)||Array.isArray(rgb)&&rgb.some(pin=>reserved.has(pin)))
        throw Error('A motor GPIO is already mapped. Choose a dedicated ESP32 for the motor driver.');
    }
  }
  const labels=Array.from({length:255},(_,index)=>'V'+((index+20)%255));
  return profilePins.map(pin=>{
    const retained=current.find(row=>row.channel_key===pin.key);
    if(retained)return {row:retained,create:false};
    const label=labels.find(candidate=>!occupied.has(candidate));
    if(!label)throw Error('Free a virtual label on the motor device before adding its pin streams.');
    occupied.add(label);
    const type=pin.pwm?'number':'boolean';
    return {create:true,row:newRow(pin.key,profile+' '+pin.signal,type,pin.pwm?'%':'',{
      virtual_pin:label,physical_pin:'GPIO'+pin.gpio,
      io:{version:1,kind:'status',type,history:false,motor_driver:profile,motor_signal:pin.signal,
        ...(pin.pwm?{min:0,max:35,step:1}:{})}
    })};
  });
}

export async function provisionHardware({profile,device,load,write,current,progress=()=>{}}){
  const check=()=>{if(!current())throw Error('Account or project changed. Reopen hardware setup.');};
  check();const plan=hardwareStreamPlan(profile,device,await load());check();
  let completed=0;
  for(const {row,create} of plan){
    check();
    if(create){
      const {device_id,...payload}=row;
      const job={p_request:crypto.randomUUID(),p_kind:'stream',p_id:crypto.randomUUID(),
        p_parent:device_id,p_base:0,p_payload:payload};
      try{
        const reply=await write(job);
        if(reply?.id!==job.p_id||reply.device_id!==device_id)throw Error('Could not confirm the stream save.');
      }catch(error){
        check();
        const catalog=await load();
        if(!hardwareStreamPlan(profile,device,catalog).some(step=>!step.create&&step.row.channel_key===row.channel_key))throw error;
      }
    }
    check();progress(++completed,plan.length);
  }
  const catalog=await load();check();
  const confirmed=hardwareStreamPlan(profile,device,catalog);
  if(confirmed.some(step=>step.create))throw Error('Some streams are still missing. Open hardware setup to retry.');
  return {catalog,streams:confirmed.map(step=>step.row)};
}

export function hardwareWidget(profile,device,streams,uuid=()=>crypto.randomUUID()){
  const camera=profile==='camera',channel=streams.find(row=>camera?cameraMediaId(row,device):row.channel_key==='motor_in1');
  if(!channel||!camera&&motorStreamProfile(channel,device)!==profile)throw Error('Choose the confirmed hardware streams.');
  return {id:uuid(),type:camera?'camera':'health',title:camera?'ESP32-CAM':profile+' motor drive',
    device_id:device.id,channel_id:channel.id,width:'full',size:{columns:12,height:0},
    phone:{span:12,visible:true},...(camera?{mode:'protected',media_id:cameraMediaId(channel,device)}:{})};
}
