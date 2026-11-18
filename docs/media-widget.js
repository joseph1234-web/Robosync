// Media stays in this browser. Saved layouts contain only source settings.
export function validateMediaUrl(value){
  let url;try{url=new URL(String(value).trim());}catch{throw new Error('Enter a complete HTTPS image, MJPEG, or video URL.');}
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.href.length>2000)throw new Error('Use an HTTPS URL without a username, password, or fragment. HTTP and RTSP sources need an HTTPS bridge.');
  if([...url.searchParams.keys()].some(k=>/token|secret|password|authorization|api[_-]?key|signature|credential/i.test(k)))throw new Error('Use a media URL without secret keys or signed credentials. Source URLs are stored with the dashboard.');
  return url.href;
}

export function createMediaWidgets({canUse}){
  const records=new Map();
  const label={webcam:'BROWSER CAMERA · LOCAL PREVIEW',snapshot:'HTTPS IMAGE / SNAPSHOT',mjpeg:'HTTPS MJPEG SOURCE',video:'HTTPS VIDEO SOURCE',local:'LOCAL FILE · THIS SESSION ONLY'};
  const element=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  function stop(record,text='Preview stopped. Select Start to resume.'){
    record.generation++;record.pending=false;
    for(const track of record.stream?.getTracks()||[])track.stop();record.stream=null;
    const media=record.media;if(media){if(media.pause)media.pause();media.srcObject=null;media.removeAttribute('src');if(media.load)media.load();}
    if(record.objectUrl){URL.revokeObjectURL(record.objectUrl);record.objectUrl=null;}
    record.file.value='';record.started=false;record.start.disabled=false;record.stop.disabled=true;record.status.textContent=text;record.preview.hidden=true;
  }
  function dispose(record){stop(record);records.delete(record.id);}
  function stopAll(){for(const record of records.values())stop(record);}
  function mediaError(record,text){stop(record,text);}
  function active(record,generation){return records.get(record.id)===record&&record.generation===generation&&canUse()&&document.hidden!==true;}
  function setMedia(record,tag){
    record.preview.replaceChildren();const media=element(tag,'camera-media');record.media=media;
    if(tag==='video'){media.muted=true;media.playsInline=true;media.controls=record.w.mode!=='webcam';media.preload='metadata';}
    else{media.alt=record.w.title+' preview';media.referrerPolicy='no-referrer';}
    media.addEventListener('error',()=>{if(record.started)mediaError(record,'This source could not be displayed. Check its URL, format, access, and browser support.');});
    record.preview.append(media);record.preview.hidden=false;return media;
  }
  function started(record,text){record.started=true;record.pending=false;record.start.disabled=true;record.stop.disabled=false;record.status.textContent=text;}
  async function start(record){
    if(record.pending||record.started||!canUse()||document.hidden===true)return;
    if(record.w.mode==='local'){record.file.click();return;}
    if(record.w.mode!=='webcam'){
      const media=setMedia(record,['snapshot','mjpeg'].includes(record.w.mode)?'img':'video');
      started(record,record.w.mode==='snapshot'?'Snapshot preview · Stop and start to reload the source.':'Source preview · Availability depends on the camera or media server.');
      media.src=validateMediaUrl(record.w.url);return;
    }
    if(!navigator.mediaDevices?.getUserMedia){record.status.textContent='Camera access is unavailable. Open this website directly in an HTTPS browser tab, or choose a local file.';return;}
    const generation=++record.generation;record.pending=true;record.start.disabled=true;record.stop.disabled=false;record.status.textContent='Waiting for camera permission. You can cancel with Stop.';
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:record.w.facing||'environment'}},audio:false});
      if(!active(record,generation)){for(const track of stream.getTracks())track.stop();return;}
      record.stream=stream;const media=setMedia(record,'video');media.autoplay=true;media.srcObject=stream;started(record,'Camera on · Preview stays in this browser. No recording or upload.');
      try{await media.play();}catch{if(active(record,generation)){media.controls=true;record.status.textContent='Camera ready. Use the video play control to view it.';}}
      for(const track of stream.getTracks())track.addEventListener?.('ended',()=>{if(record.stream===stream)mediaError(record,'Camera disconnected. Select Start to try again.');});
    }catch(err){if(!active(record,generation))return;const text=err.name==='NotAllowedError'?'Camera permission was denied or blocked. Allow camera access in your browser; an embedded preview may require opening the website directly.':err.name==='NotFoundError'?'No camera was found. Connect a webcam or choose a local image / video.':err.name==='NotReadableError'?'The camera is busy or unavailable. Close other camera apps and try again.':'Camera could not start. Check browser permissions or choose a local file.';mediaError(record,text);}
  }
  function render(w){
    const fingerprint=JSON.stringify([w.mode,w.url||'',w.facing||'']);let record=records.get(w.id);
    if(record&&record.fingerprint!==fingerprint){dispose(record);record=null;}
    if(record){record.w=w;return record.root;}
    const root=element('div','camera-widget'),kind=element('p','camera-source-label',label[w.mode]),preview=element('div','camera-preview'),status=element('p','camera-status','Select Start to preview. Nothing loads automatically.');preview.hidden=true;status.setAttribute('role','status');
    const actions=element('div','camera-actions'),startButton=element('button','button secondary',w.mode==='local'?'Choose image / video':'Start preview'),stopButton=element('button','text-button','Stop'),file=element('input','camera-file');startButton.type=stopButton.type='button';stopButton.disabled=true;file.type='file';file.accept='image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';file.hidden=true;
    record={id:w.id,w,fingerprint,root,preview,status,start:startButton,stop:stopButton,file,media:null,stream:null,objectUrl:null,generation:0,pending:false,started:false};records.set(w.id,record);
    startButton.addEventListener('click',()=>start(record));stopButton.addEventListener('click',()=>stop(record));
    file.addEventListener('change',()=>{
      const selected=file.files?.[0];if(!selected||!canUse()||document.hidden===true)return;
      if(!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(selected.type)||selected.size>50*1024*1024){stop(record,'Choose a JPG, PNG, WebP, GIF, MP4, or WebM file up to 50 MB.');return;}
      stop(record);const media=setMedia(record,selected.type.startsWith('video/')?'video':'img');record.objectUrl=URL.createObjectURL(selected);started(record,'Local file preview · No upload. Choose the file again after reopening this page.');media.src=record.objectUrl;
    });
    actions.append(startButton,stopButton);root.append(kind,preview,status,actions,file);
    const help=element('p','camera-help',w.mode==='webcam'?'Browser permission is required. Video only; no microphone, recording, or upload.':w.mode==='local'?'Preview a saved experiment image or clip. File contents and file paths are not saved to Supabase.':'Use a browser-compatible HTTPS source. ESP32-CAM HTTP streams need an HTTPS bridge; RTSP links cannot play directly.');root.append(help);return root;
  }
  function sync(widgets){const ids=new Set(widgets.filter(w=>w.type==='camera').map(w=>w.id));for(const record of records.values())if(!ids.has(record.id))dispose(record);}
  addEventListener('pagehide',stopAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});
  return {render,sync,stopAll,reset:()=>{for(const record of records.values())dispose(record);}};
}
