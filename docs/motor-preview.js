const profiles={
  L293D:['1 · 1,2EN','2 · 1A','7 · 2A','10 · 3A','15 · 4A','9 · 3,4EN'],
  L298N:['ENA','IN1','IN2','IN3','IN4','ENB']
};
const signals=[
  ['ENA',25],['IN1',27],['IN2',32],['IN3',33],['IN4',23],['ENB',26]
];
export const motorDriver=value=>Object.hasOwn(profiles,value)?value:'L298N';
const download=driver=>'./downloads/RoboSynct_'+driver+'_ESP32.zip';

function node(tag,text,className){
  const element=document.createElement(tag);
  if(text!==undefined)element.textContent=text;
  if(className)element.className=className;
  return element;
}

export function renderMotorPreview({driver='L298N',onProfileChange=()=>{},dashboard=false}={}){
  driver=motorDriver(driver);
  const preview=node('section',undefined,'motor-preview'+(dashboard?' motor-preview-card':''));
  preview.setAttribute('aria-label','Motor drive preview');
  const header=node('div',undefined,'motor-header');
  header.append(node('h2','Motor drive'),node('span','Simulation','motor-mode'));
  preview.append(header);

  const settings=node('div',undefined,'motor-settings');
  const profileLabel=node('label','Motor driver'),profile=node('select');
  profile.setAttribute('aria-label','Motor driver');
  for(const name of Object.keys(profiles)){
    const option=node('option',name);option.value=name;profile.append(option);
  }
  profile.value=driver;profileLabel.append(profile);
  const speedLabel=node('label','Speed limit'),speed=node('input'),speedValue=node('output','20%');
  speed.type='range';speed.min='10';speed.max='35';speed.value='20';
  speed.setAttribute('aria-label','Speed limit');
  speedLabel.append(speed,speedValue);settings.append(profileLabel,speedLabel);
  preview.append(settings);

  const content=node('div',undefined,'motor-content');
  const controller=node('div',undefined,'motor-controller');
  const pad=node('div',undefined,'motor-pad');
  const state=node('p','Stopped','motor-state');
  state.setAttribute('role','status');
  controller.append(pad,state);

  const table=node('table',undefined,'motor-pins');
  table.append(node('caption','Pin streams'));
  const columns=table.createTHead().insertRow();
  for(const name of ['Signal','Driver pin','ESP32','Level']){
    const th=node('th',name);th.scope='col';columns.append(th);
  }
  const body=table.createTBody();
  const rows=signals.map(([name,gpio])=>{
    const row=body.insertRow(),heading=node('th',name);
    heading.scope='row';row.append(heading);
    const pin=row.insertCell(),physical=row.insertCell(),value=row.insertCell();
    physical.textContent='GPIO'+gpio;
    row.dataset.signal=name;
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
    pressed=null;pointer=null;a=b=0;state.textContent='Stopped';levels();
  }
  function start(button,name,left,right,pointerId){
    if(pressed){stop();return;}
    pressed=button;pointer=pointerId;button.dataset.held='';
    a=left*Number(speed.value);b=right*Number(speed.value);state.textContent=name;levels();
  }
  for(const [id,label,text,left,right] of [
    ['forward','Forward','↑',1,1],['left','Left','←',-1,1],['right','Right','→',1,-1],['reverse','Reverse','↓',-1,-1]
  ]){
    const button=node('button',text);
    button.type='button';button.dataset.direction=id;button.setAttribute('aria-label','Hold '+label.toLowerCase());
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
  halt.type='button';halt.className='motor-stop';halt.addEventListener('click',stop);pad.append(halt);
  function changeProfile(){
    stop();
    rows.forEach(({pin},index)=>{pin.textContent=profiles[driver][index];});
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
