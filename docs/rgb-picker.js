const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));

export function rgbHex(value) {
  return Array.isArray(value)&&value.length===3&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255)
    ? '#'+value.map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase()
    : null;
}

function toRgb(h,s,v) {
  const chroma=v*s, x=chroma*(1-Math.abs(h/60%2-1)), white=v-chroma;
  const sectors=[[chroma,x,0],[x,chroma,0],[0,chroma,x],[0,x,chroma],[x,0,chroma],[chroma,0,x]];
  return sectors[Math.floor(h/60)].map(n=>Math.round(255*(n+white)));
}

function toHsv(rgb,hue) {
  const [r,g,b]=rgb.map(n=>n/255), max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  if(!d)return [hue,0,max];
  const axis=max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4;
  return [(axis*60+360)%360,d/max,max];
}

export function mountRgbPicker(onPick) {
  const root=document.createElement('div');
  root.className='rgb-picker';
  const wheel=document.createElement('div'),marker=document.createElement('span');
  wheel.className='rgb-wheel';wheel.setAttribute('aria-hidden','true');
  marker.className='rgb-wheel-marker';wheel.append(marker);

  const level=document.createElement('label'),brightness=document.createElement('input'),percent=document.createElement('output');
  const brightnessLabel=document.createElement('span');
  level.className='rgb-brightness';brightnessLabel.textContent='Brightness';
  brightness.setAttribute('aria-label','Brightness');
  brightness.type='range';brightness.min='0';brightness.max='100';brightness.step='1';brightness.value='100';
  level.append(brightnessLabel,brightness,percent);

  const selection=document.createElement('label'),color=document.createElement('input'),code=document.createElement('output');
  selection.className='rgb-selection';color.type='color';color.setAttribute('aria-label','RGB color');
  selection.append(color,code);root.append(wheel,level,selection);

  let hsv=[0,1,1], selected=hsv.slice(), enabled=false, pointer=null, adjustingLevel=false, adjustingColor=false;
  function render() {
    const [h,s,v]=hsv, angle=h*Math.PI/180;
    marker.style.left=(50+50*s*Math.cos(angle))+'%';
    marker.style.top=(50-50*s*Math.sin(angle))+'%';
    const hex=rgbHex(toRgb(h,s,v));
    color.value=hex;code.value=hex;
    brightness.value=percent.value=Math.round(v*100);
    percent.value+='%';
    brightness.style.setProperty('--rgb-bright',rgbHex(toRgb(h,s,1)));
  }
  function commit() {
    if(!enabled||!root.isConnected)return;
    selected=hsv.slice();
    onPick(toRgb(...selected));
  }
  function position(event) {
    const {left,top,width,height}=wheel.getBoundingClientRect();
    const radius=Math.min(width,height)/2;
    if(!radius)return;
    const x=event.clientX-left-width/2, y=top+height/2-event.clientY;
    const distance=Math.hypot(x,y);
    if(distance)hsv[0]=(Math.atan2(y,x)*180/Math.PI+360)%360;
    hsv[1]=clamp(distance/radius,0,1);
    render();
  }
  function cancelWheel() {
    if(pointer===null)return;
    pointer=null;hsv=selected.slice();render();
  }
  wheel.addEventListener('pointerdown',event=>{
    if(!enabled)return;
    if(pointer!==null){cancelWheel();return;}
    if(!event.isPrimary||event.button!==0)return;
    event.preventDefault();
    pointer=event.pointerId;
    wheel.setPointerCapture(pointer);
    position(event);
  });
  wheel.addEventListener('pointermove',event=>{
    if(enabled&&pointer===event.pointerId)position(event);
  });
  wheel.addEventListener('pointerup',event=>{
    if(!enabled||pointer!==event.pointerId)return;
    position(event);pointer=null;commit();
  });
  for(const event of ['pointercancel','lostpointercapture'])wheel.addEventListener(event,cancelWheel);

  brightness.addEventListener('pointerdown',()=>{adjustingLevel=true;});
  brightness.addEventListener('input',()=>{hsv[2]=Number(brightness.value)/100;render();});
  brightness.addEventListener('pointerup',()=>{adjustingLevel=false;});
  brightness.addEventListener('pointercancel',()=>{
    adjustingLevel=false;hsv=selected.slice();render();
  });
  brightness.addEventListener('change',commit);

  function readColor() {
    const hex=color.value;
    if(!/^#[0-9a-f]{6}$/i.test(hex))return;
    hsv=toHsv([1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)),hsv[0]);
    render();
  }
  color.addEventListener('input',()=>{adjustingColor=true;readColor();});
  color.addEventListener('change',()=>{readColor();adjustingColor=false;commit();});
  color.addEventListener('blur',()=>{adjustingColor=false;});
  render();

  return {
    element:root,
    value:()=>rgbHex(toRgb(...hsv)),
    setColor(rgb) {
      const next=rgbHex(rgb);
      if(pointer!==null||adjustingLevel||adjustingColor||!next||next===rgbHex(toRgb(...hsv)))return;
      hsv=toHsv(rgb,hsv[0]);selected=hsv.slice();render();
    },
    setEnabled(value) {
      if(value===enabled)return;
      enabled=value;wheel.classList.toggle('enabled',value);
      if(!value){
        cancelWheel();
        if(adjustingLevel||adjustingColor){hsv=selected.slice();render();}
        adjustingLevel=adjustingColor=false;
      }
    }
  };
}
