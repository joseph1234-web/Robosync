import { motorPins } from './hardware-streams.js?v=3.0.2';

const profiles=['L298N','L293D'];
export const motorDriver=value=>profiles.includes(value)?value:'L298N';
const download=driver=>'./downloads/RoboSynct_'+driver+'_ESP32.zip';

function node(tag,text,className){
  const element=document.createElement(tag);
  if(text!==undefined)element.textContent=text;
  if(className)element.className=className;
  return element;
}

export function renderMotorPreview({driver='L298N',onProfileChange=()=>{},dashboard=false,streams=null,interactive=true}={}){
  driver=motorDriver(driver);
  const preview=node('section',undefined,'motor-preview'+(dashboard?' motor-preview-card':''));
  preview.setAttribute('aria-label','Motor drive preview');
  const header=node('div',undefined,'motor-header');
  header.append(node('h2',streams?'Controller':'Motor drive'),node('span',interactive?'Simulation':'Preview','motor-mode'));
  preview.append(header);

  const settings=node('div',undefined,'motor-settings');
  const profileLabel=node('label','Motor driver'),profile=node('select');
  profile.setAttribute('aria-label','Motor driver');
  for(const name of profiles){
    const option=node('option',name);option.value=name;profile.append(option);
  }
  profile.value=driver;profileLabel.append(profile);
  const speedLabel=node('label','Speed limit'),speed=node('input'),speedValue=node('output','20%');
  speed.type='range';speed.min='10';speed.max='35';speed.value='20';
  speed.setAttribute('aria-label','Speed limit');
  speedLabel.append(speed,speedValue);
  if(!streams)settings.append(profileLabel);
  settings.append(speedLabel);
  preview.append(settings);

  const content=node('div',undefined,'motor-content');
  const controller=node('div',undefined,'motor-controller');
  const pad=node('div',undefined,'motor-pad');
  const state=node('p','Stopped','motor-state');
  state.setAttribute('role','status');
  const controllerHead=node('div',undefined,'motor-controller-heading');
  controllerHead.append(node('span',driver,'motor-controller-profile'),state);
  controller.append(controllerHead,pad,node('p',interactive?'Hold to move · release to stop':'Controller preview','motor-controller-hint'));

  const table=node('table',undefined,'motor-pins');
  table.append(node('caption','Pin streams'));
  const columns=table.createTHead().insertRow();
  for(const name of ['Signal',...(streams?['Virtual']:[]),'Driver pin','ESP32','Preview']){
    const th=node('th',name);th.scope='col';columns.append(th);
  }
  const body=table.createTBody();
  const rows=motorPins(driver).map(({signal,gpio,key})=>{
    const row=body.insertRow(),heading=node('th',signal);
    heading.scope='row';row.append(heading);
    if(streams){
      const virtual=row.insertCell();
      virtual.textContent=streams.find(item=>item.channel_key===key)?.config?.virtual_pin||'—';
    }
    const pin=row.insertCell(),physical=row.insertCell(),value=row.insertCell();
    physical.textContent='GPIO'+gpio;
    row.dataset.signal=signal;
    return {pin,value};
  });
  content.append(controller,table);preview.append(content);

  const actions=node('div',undefined,'motor-actions');
  const firmware=node('a','Download firmware','button secondary');
  firmware.setAttribute('download','');
  const setup=node('a',dashboard?'Motor setup':'Android APK','button secondary');
  setup.href=dashboard?'./motor-drive.html?driver='+driver:'./android-app.html';
  actions.append(firmware,setup);preview.append(actions);

  let pressed=null,pointer=null,a=0,b=0;
  function levels(){
    const values=[Math.abs(a)+'%',a>0?'HIGH':'LOW',a<0?'HIGH':'LOW',b>0?'HIGH':'LOW',b<0?'HIGH':'LOW',Math.abs(b)+'%'];
    rows.forEach(({value},index)=>{value.textContent=values[index];});
  }
  function stop(){
    if(pressed)pressed.removeAttribute('data-held');
    preview.removeAttribute('data-driving');
    pressed=null;pointer=null;a=b=0;state.textContent='Stopped';levels();
  }
  function start(button,name,left,right,pointerId){
    if(pressed){stop();return;}
    pressed=button;pointer=pointerId;button.dataset.held='';preview.dataset.driving='';
    a=left*Number(speed.value);b=right*Number(speed.value);state.textContent=name;levels();
  }
  for(const [id,label,text,left,right] of [
    ['forward','Forward','↑',1,1],['left','Left','←',-1,1],['right','Right','→',1,-1],['reverse','Reverse','↓',-1,-1]
  ]){
    const button=node('button');
    const arrow=node('span',text,'motor-arrow');arrow.setAttribute('aria-hidden','true');
    button.append(arrow,node('span',label,'motor-direction-label'));
    button.type='button';button.dataset.direction=id;button.setAttribute('aria-label','Hold '+label.toLowerCase());
    button.disabled=!interactive;
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();
      button.focus({preventScroll:true});
      button.setPointerCapture(event.pointerId);
      start(button,label,left,right,event.pointerId);
    });
    button.addEventListener('pointermove',event=>{
      if(pointer!==event.pointerId)return;
      const box=button.getBoundingClientRect();
      if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)stop();
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,ev=>{
      if(pointer===ev.pointerId)stop();
    });
    button.addEventListener('keydown',event=>{
      if(![' ','Enter'].includes(event.key))return;
      event.preventDefault();
      if(!event.repeat)start(button,label,left,right,null);
    });
    button.addEventListener('keyup',event=>{
      if([' ','Enter'].includes(event.key)&&pressed===button){event.preventDefault();stop();}
    });
    button.addEventListener('blur',()=>{if(pressed===button)stop();});
    pad.append(button);
  }
  const halt=node('button','Stop');
  halt.type='button';halt.className='motor-stop';halt.disabled=!interactive;halt.addEventListener('click',stop);pad.append(halt);
  speed.disabled=!interactive;
  function changeProfile(){
    stop();
    controllerHead.firstChild.textContent=driver;
    const pins=motorPins(driver);
    rows.forEach(({pin},index)=>{pin.textContent=pins[index].pin;});
    firmware.href=download(driver);
    if(dashboard)setup.href='./motor-drive.html?driver='+driver;
  }
  profile.addEventListener('change',()=>{
    driver=motorDriver(profile.value);changeProfile();onProfileChange(driver);
  });
  speed.addEventListener('input',()=>{speedValue.value=speed.value+'%';stop();});
  changeProfile();
  return {element:preview,stop};
}
