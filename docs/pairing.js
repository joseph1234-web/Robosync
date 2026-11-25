import { WEBSITE_ORIGIN } from './public-config.js?v=0.36.1';
import { makeQrSvg, makePairingLink, pairingSecret } from './qr-code.js?v=0.36.1';
export function createPairing({request,friendlyError,getSession,getGeneration,getProjects}){
  const $=id=>document.getElementById(id),show=(id,on=true)=>{$(id).hidden=!on;},message=(id,text)=>{$(id).textContent=text;show(id,!!text);};
  let project=null,job=null,busy=false,version=0,timer=null,pollVersion=0,link='';
  const rpc=(name,body)=>request('/rest/v1/rpc/'+name,{method:'POST',authenticated:true,body});
  const context=()=>({v:version,g:getGeneration(),id:project?.id});
  const alive=ctx=>ctx.v===version&&ctx.g===getGeneration()&&ctx.id===project?.id&&!!getSession();
  function network(){
    $('phone-web-state').textContent=navigator.onLine?'Online':'Offline';
    controls();
  }
  function controls(){$('qr-generate').disabled=busy||!project||!navigator.onLine;
    $('qr-browser-link').disabled=busy||!link||!['pending','claimed'].includes(job?.status);$('qr-project').disabled=busy;$('qr-copy').disabled=busy||!link||!['pending','claimed'].includes(job?.status);$('qr-approve').disabled=busy||!$('qr-code-match').checked||job?.status!=='claimed';$('qr-deny').disabled=busy||job?.status!=='claimed';$('qr-generate').textContent=busy?'Please wait…':job?.status==='creating'?'Retry connection QR':job?'Generate new QR':'Generate connection QR';}
  function error(err,fallback){
    if(['PGRST202','42883','42P01'].includes(err.code)){show('qr-setup');return 'QR pairing is not installed yet. Run the setup SQL once, then retry.';}
    return friendlyError(err,fallback);
  }
  function stopPolling(){clearTimeout(timer);timer=null;pollVersion++;}
  function cancelCurrent(){const old=job;if(old&&['creating','pending','claimed'].includes(old.status)&&getSession())rpc('rs_pairing_cancel',{p_request_id:old.id}).catch(()=>{});}
  function clearRequest(){stopPolling();cancelCurrent();job=null;link='';$('qr-code-frame').replaceChildren();show('qr-code-frame',false);show('qr-approval',false);$('qr-code-match').checked=false;$('qr-allow-arrange').checked=false;$('qr-match-code').textContent='';$('qr-device-label').textContent='';}
  function reset(){clearRequest();$('phone-saved-layout').textContent='';$('phone-recent-contact').textContent='';$('phone-saved-editor').hidden=true;version++;project=null;busy=false;$('qr-connections').replaceChildren();$('qr-project').replaceChildren();if($('qr-dialog').open)$('qr-dialog').close();message('qr-error','');show('qr-setup',false);controls();}
  async function layout(){
    if(!project)return;
    const ctx=context(),id=encodeURIComponent(project.id),editor=$('phone-saved-editor');
    editor.href='./?project='+id+'&editor=phone';
    editor.hidden=false;
    $('phone-saved-layout').textContent='Checking…';
    try{
      const records=await request('/rest/v1/widgets?select=id,project_id,config,revision&id=eq.'+id+'&project_id=eq.'+id,{authenticated:true});
      if(!alive(ctx))return;
      const record=Array.isArray(records)&&records.find(row=>row.id===project.id&&row.project_id===project.id);
      const count=Array.isArray(record?.config?.widgets)?record.config.widgets.length:null;
      $('phone-saved-layout').textContent=count===null?'No saved dashboard':count+' widgets · revision '+record.revision;
    }catch{if(alive(ctx))$('phone-saved-layout').textContent='Unavailable';}
  }

  async function connections(){
    if(!project||!getSession())return;const ctx=context();$('qr-refresh-connections').disabled=true;$('phone-recent-contact').textContent='Checking…';
    try{
      const rows=await rpc('rs_pairing_connections',{p_project_id:project.id});if(!alive(ctx))return;if(!Array.isArray(rows))throw new Error('Unexpected response');$('qr-connections').replaceChildren();show('qr-setup',false);
      const activeRows=rows.filter(row=>!row.revoked_at&&Date.parse(row.expires_at)>Date.now());
      const last=Math.max(...activeRows.map(row=>Date.parse(row.last_used_at)).filter(Number.isFinite));
      $('phone-recent-contact').textContent=activeRows.length
        ?activeRows.length+' paired · '+(Number.isFinite(last)?'Last sync '+new Date(last).toLocaleString():'Awaiting first sync')
        :'No active pairing';
      if(!rows.length){const p=document.createElement('p');p.className='form-help';p.textContent='No phones paired with this dashboard yet.';$('qr-connections').append(p);}
      for(const row of rows){const active=!row.revoked_at&&Date.parse(row.expires_at)>Date.now(),card=document.createElement('div');card.className='qr-connection-row';const text=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('p');title.textContent=row.device_label;detail.textContent=(active?'Paired':row.revoked_at?'Revoked':'Expired')+' · '+(row.can_arrange?'View + arrange existing widgets':'View dashboard')+' · Expires '+new Date(row.expires_at).toLocaleDateString()+(row.last_used_at?' · Last sync '+new Date(row.last_used_at).toLocaleString():'');text.append(title,detail);card.append(text);
        if(active){const button=document.createElement('button');button.type='button';button.className='text-button danger-text';button.textContent='Revoke';button.setAttribute('aria-label','Revoke '+row.device_label);button.addEventListener('click',async()=>{if(!alive(ctx))return;button.disabled=true;try{await rpc('rs_pairing_revoke',{p_connection_id:row.id});if(alive(ctx))await connections();}catch(err){if(alive(ctx)){message('qr-error',error(err,'Couldn’t revoke this connection. Retry safely.'));button.disabled=false;}}});card.append(button);}$('qr-connections').append(card);
      }
    }catch(err){if(alive(ctx)){$('phone-recent-contact').textContent='Unavailable';message('qr-error',error(err,'Couldn’t load paired phones. Use Refresh to retry.'));}}
    finally{if(alive(ctx))$('qr-refresh-connections').disabled=false;}
  }
  async function open(preferred){
    clearRequest();version++;busy=false;const projects=getProjects();$('qr-project').replaceChildren();for(const p of projects){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;$('qr-project').append(option);}project=projects.find(p=>p.id===preferred?.id)||projects[0]||null;$('qr-project').value=project?.id||'';message('qr-error','');show('qr-setup',false);$('qr-status').textContent=project?'Generate a connection QR for “'+project.name+'”. Only the saved dashboard is shared.':'Create a project and save a dashboard first.';network();$('qr-dialog').showModal();if(project)await Promise.all([connections(),layout()]);
    else{$('phone-saved-layout').textContent='Choose a project';$('phone-recent-contact').textContent='—';$('phone-saved-editor').hidden=true;}
  }
  async function poll(){
    stopPolling();if(!job||!['pending','claimed'].includes(job.status)||!$('qr-dialog').open||document.hidden||!getSession())return;
    const ctx=context(),cycle=pollVersion,id=job.id;
    timer=setTimeout(async()=>{
      if(!alive(ctx)||cycle!==pollVersion||job?.id!==id)return;
      try{
        const state=await rpc('rs_pairing_status',{p_request_id:id});if(!alive(ctx)||cycle!==pollVersion||job?.id!==id)return;
        job={...job,...state};const seconds=Math.max(0,Math.ceil((Date.parse(state.expires_at)-Date.now())/1000));
        if(state.status==='claimed'){
          show('qr-approval');$('qr-device-label').textContent=state.device_label||'A phone requested access';$('qr-match-code').textContent=state.match_code;$('qr-status').textContent='Phone scanned. Compare the code before approving · '+seconds+' seconds left.';
        }else if(state.status==='pending')$('qr-status').textContent='Waiting for the Android scan · '+seconds+' seconds left.';
        else{link='';$('qr-code-frame').replaceChildren();show('qr-code-frame',false);show('qr-approval',false);$('qr-status').textContent=state.status==='approved'?'Phone approved. Its dashboard connection is available.':state.status==='expired'?'This code expired. Generate a new QR.':'The connection request ended. Generate a new QR to retry.';if(state.status==='approved')await connections();}
        controls();poll();
      }catch(err){if(alive(ctx)&&cycle===pollVersion){message('qr-error',error(err,'Couldn’t check the scan yet. Reconnecting…'));poll();}}
    },2000);
  }
  async function generate(){
    if(busy||!project||!getSession())return;
    if(job?.status!=='creating'){clearRequest();job={id:crypto.randomUUID(),invite:pairingSecret(),status:'creating'};}
    const ctx=context(),draft=job;busy=true;controls();message('qr-error','');
    try{
      const result=await rpc('rs_pairing_create',{p_project_id:project.id,p_request_id:draft.id,p_invite_token:draft.invite});if(!alive(ctx)||job?.id!==draft.id)return;
      job.status=result.status;
      if(result.id!==draft.id||!['pending','claimed'].includes(result.status)||!Number.isFinite(Date.parse(result.expires_at))||Date.parse(result.expires_at)<=Date.now())throw new Error('The invitation expired. Generate a new QR.');
      job={...draft,...result};link=makePairingLink(WEBSITE_ORIGIN,draft.id,draft.invite);$('qr-code-frame').replaceChildren(makeQrSvg(link));show('qr-code-frame');show('qr-setup',false);$('qr-status').textContent='Scan in the RoboSynct Android app, then compare and approve the phone code. Expires '+new Date(result.expires_at).toLocaleTimeString()+'.';poll();
    }catch(err){if(alive(ctx))message('qr-error',error(err,'Couldn’t confirm this connection code. Retry to reuse the same request safely.'));}
    finally{if(alive(ctx)){busy=false;controls();}}
  }
  async function decide(approve){
    if(busy||job?.status!=='claimed'||approve&&!$('qr-code-match').checked)return;const ctx=context(),id=job.id;busy=true;controls();message('qr-error','');
    try{
      const result=await rpc('rs_pairing_decide',{p_request_id:id,p_code:job.match_code,p_approve:approve,p_allow_arrange:approve&&$('qr-allow-arrange').checked});if(!alive(ctx)||job?.id!==id)return;job.status=result.status;link='';stopPolling();$('qr-code-frame').replaceChildren();show('qr-code-frame',false);show('qr-approval',false);$('qr-status').textContent=approve?'Phone approved for this saved dashboard. Its connection expires '+new Date(result.expires_at).toLocaleDateString()+'.':'Phone request rejected. No dashboard access was granted.';await connections();
    }catch(err){if(alive(ctx))message('qr-error',error(err,'Couldn’t confirm the decision. Retry the same request safely.'));}
    finally{if(alive(ctx)){busy=false;controls();}}
  }
  $('qr-copy-setup').addEventListener('click',async()=>{try{const response=await fetch(new URL('./setup/qr-pairing.sql',window.location.href).href,{cache:'no-store'});if(!response.ok)throw new Error('Unavailable');const sql=await response.text();await navigator.clipboard.writeText(sql);$('qr-status').textContent='Setup SQL copied. Paste and run it in Supabase SQL Editor, then retry generating the QR.';}catch{message('qr-error','Couldn’t copy automatically. Use Open QR pairing SQL and copy the file contents.');}});
  $('qr-generate').addEventListener('click',generate);$('qr-approve').addEventListener('click',()=>decide(true));$('qr-deny').addEventListener('click',()=>decide(false));$('qr-code-match').addEventListener('change',controls);$('qr-refresh-connections').addEventListener('click',connections);
  $('qr-project').addEventListener('change',async()=>{clearRequest();version++;project=getProjects().find(p=>p.id===$('qr-project').value)||null;message('qr-error','');$('qr-connections').replaceChildren();$('qr-status').textContent='Generate a five-minute connection code.';controls();await Promise.all([connections(),layout()]);});
  $('qr-copy').addEventListener('click',async()=>{if(!link)return;try{await navigator.clipboard.writeText(link);$('qr-status').textContent='Connection link copied. It contains a short-lived invitation, not your account session.';}catch{message('qr-error','Clipboard access was unavailable. Scan the QR instead.');}});
  $('qr-browser-link').addEventListener('click',async()=>{
    if(!link)return;
    const url=new URL('./android-connect.html',location.href);
    url.hash=new URL(link).hash;
    try{await navigator.clipboard.writeText(url.href);$('qr-status').textContent='Browser pairing link copied.';}
    catch{message('qr-error','Clipboard unavailable. Use the Android QR.');}
  });
  addEventListener('online',network);
  addEventListener('offline',network);
  $('qr-dialog').addEventListener('close',()=>{clearRequest();version++;busy=false;controls();});document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPolling();else if($('qr-dialog').open)poll();});addEventListener('pagehide',reset);
  return {open,reset};
}
