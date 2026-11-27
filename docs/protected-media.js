import { SUPABASE_URL,PUBLISHABLE_KEY } from './public-config.js?v=0.36.1';

export function protectedMedia(widget,{request,getSession,canUse,onDispose,readOnly=false}){
  const box=document.createElement('div'),frame=document.createElement('div');
  const placeholder=document.createElement('span'),image=document.createElement('img');
  const state=document.createElement('p'),button=document.createElement('button');
  box.className='camera-feed';frame.className='camera-feed-window';
  placeholder.className='camera-feed-placeholder';placeholder.textContent='Private camera';
  state.className='camera-feed-status';state.setAttribute('role','status');
  image.alt=widget.title+' · protected JPEG';image.hidden=true;
  button.className='button secondary';button.type='button';button.textContent='Open protected snapshot';
  frame.append(placeholder,image);box.append(frame,state,button);

  if(readOnly){button.disabled=true;return box;}
  const owner=getSession()?.user?.id;
  let opened=false,disposed=false,epoch=0,timer,abort,url;
  const authorized=()=>!disposed&&!document.hidden&&!!owner&&owner===getSession()?.user?.id&&canUse();
  function clearImage(){
    if(url)URL.revokeObjectURL(url);
    url=null;image.removeAttribute('src');image.hidden=true;placeholder.hidden=false;
  }
  function close(){
    opened=false;epoch++;clearTimeout(timer);abort?.abort();clearImage();
    button.textContent='Open protected snapshot';state.textContent='';
  }
  async function refresh(){
    if(!opened||!authorized()){close();return;}
    const run=epoch,current=()=>opened&&run===epoch&&authorized();
    try{
      const meta=await request('/rest/v1/rpc/rs_media_view',{method:'POST',authenticated:true,body:{p_media:widget.media_id}});
      if(!current())return;
      if(!meta?.frame_id){
        clearImage();state.textContent='Waiting for the first camera snapshot.';return;
      }
      abort=new AbortController();
      const response=await fetch(SUPABASE_URL+'/functions/v1/rs-media?action=view&media='+encodeURIComponent(widget.media_id),{
        headers:{apikey:PUBLISHABLE_KEY,Authorization:'Bearer '+getSession().access_token,'X-RS-View':meta.viewer_token},
        signal:abort.signal,cache:'no-store',redirect:'error'
      });
      if(!response.ok||response.headers.get('content-type')!=='image/jpeg'||!response.body)
        throw Error('Couldn’t open the private snapshot.');
      const reader=response.body.getReader(),parts=[];
      let count=0;
      for(;;){
        const {value,done}=await reader.read();
        if(done)break;
        count+=value.length;
        if(count>262144){await reader.cancel();throw Error('Snapshot exceeds the media limit.');}
        parts.push(value);
      }
      if(!current())return;
      if(!count)throw Error('The camera returned an empty snapshot.');
      clearImage();
      url=URL.createObjectURL(new Blob(parts,{type:'image/jpeg'}));
      image.src=url;image.hidden=false;placeholder.hidden=true;
      state.textContent=meta.paused?'Uploads paused':meta.stale?'Last saved snapshot':'';
    }catch(error){
      if(current()){clearImage();state.textContent=error.message;}
    }finally{
      if(current())timer=setTimeout(refresh,5000);
      else if(run===epoch)close();
    }
  }
  button.addEventListener('click',()=>{
    if(opened){close();return;}
    if(!authorized()){state.textContent='Sign in to view private camera snapshots.';return;}
    opened=true;button.textContent='Close preview';state.textContent='Opening camera…';refresh();
  });
  const onVisibility=()=>{if(document.hidden)close();};
  document.addEventListener('visibilitychange',onVisibility);
  onDispose(()=>{disposed=true;close();document.removeEventListener('visibilitychange',onVisibility);});
  return box;
}
