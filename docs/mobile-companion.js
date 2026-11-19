import { parsePairingLink, mobileRpc } from './mobile-protocol.js?v=0.36.1';
import { pairingSecret } from './qr-code.js?v=0.36.1';
import { applySurfaceTheme, THEME_IDS } from './themes.js?v=0.36.1';
import { streamValue, validStreamReadings } from './sensor-catalog.js?v=0.36.1';
const deviceTheme=document.documentElement.getAttribute('data-theme')||'mint';
const $=id=>document.getElementById(id),show=(id,on=true)=>{$(id).hidden=!on;},storeKey='robosynct.mobile-project.v1';
let invitation=null,grant=null,timer=null,version=0,snapshot=null,layout=[],dirty=false,saving=false,pendingSave=null;
const text=(id,value)=>{$(id).textContent=value;};
function error(value){text('mobile-error',value||'');show('mobile-error',!!value);}
function saveGrant(){try{if(grant)sessionStorage.setItem(storeKey,JSON.stringify(grant));else sessionStorage.removeItem(storeKey);}catch{}}
function schedule(fn,delay=5000){clearTimeout(timer);if(document.hidden)return;timer=setTimeout(fn,delay);}
function element(tag,cls,value){const el=document.createElement(tag);el.className=cls;if(value!==undefined)el.textContent=value;return el;}
function number(value){return Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:2}):'—';}
function render(){
  if(!snapshot)return;const config=snapshot.dashboard?.config||{},sources=new Map((snapshot.sources||[]).map(s=>[s.channel.id,s]));applySurfaceTheme(document.documentElement,THEME_IDS.includes(config.theme)?config.theme:deviceTheme);text('mobile-project-name',snapshot.project.name);text('mobile-scope',snapshot.can_arrange?'Paired · View, rearrange, and resize this dashboard':'Paired · View this dashboard');text('mobile-update-time','Saved data updated '+new Date(snapshot.refreshed_at).toLocaleTimeString()+'. Checks every 5 seconds while visible.');$('mobile-widgets').replaceChildren();
  for(const w of (config.widgets||[]).slice(0,24)){
    const card=element('article','dashboard-widget'),heading=element('h3','',w.title);applySurfaceTheme(card,w.theme);card.style.setProperty('--widget-cols',String(w.size?.columns||(w.width==='full'?12:6)));if(w.size?.height){card.style.setProperty('--widget-height',w.size.height+'px');card.classList.toggle('sized-widget',true);}card.append(heading);const source=sources.get(w.channel_id),valid=validStreamReadings(source?.readings||[],source?.channel.value_type||'number'),latest=valid.at(-1);
    if(w.type==='note')card.append(element('p','widget-note-copy',w.note||''));
    else if(w.type==='heading')heading.className='widget-section-heading';
    else if(w.type==='divider')card.append(element('hr','widget-divider'));
    else if(w.type==='camera')card.append(element('p','form-help','Camera / media widget · Its source settings are synced. Browser cameras and local files belong to the device using them and are not transferred.'));
    else if(source?.channel?.direction==='output'){
      // Paired-phone dashboards are read-only: render only a current-boot applied receipt
      // returned by the authenticated connection. Never send or replay output commands.
      const confirmed=source.confirmed_output,raw=confirmed?.value,driver=w.type;
      const rgb=driver==='rgb'&&Array.isArray(raw)&&raw.length===3&&raw.every(n=>Number.isInteger(n)&&n>=0&&n<=255);
      const bit=Array.isArray(raw)&&raw.length>0&&raw[0]===1?true:Array.isArray(raw)&&raw.length>0&&raw[0]===0?false:typeof raw==='boolean'?raw:null;
      if(rgb){
        const hex='#'+raw.map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
        const preview=element('div','widget-status','Board-reported RGB · '+hex+' · '+raw.join(', '));
        const swatch=element('span','widget-led');swatch.style.backgroundColor=hex;preview.prepend(swatch);card.append(preview);
      }else if(driver==='switch'&&bit!==null){
        card.append(element('p','widget-status'+(bit?' is-on':''),'Board-reported relay · '+(bit?'On':'Off')));
      }else{
        card.append(element('p','widget-no-data','Board application unconfirmed · last selected color is not proof of application.'));
      }
      if(confirmed&&(rgb||driver==='switch'&&bit!==null)){
        const when=Date.parse(confirmed.applied_at);
        card.append(element('p','form-help','Board ACK'+(Number.isFinite(when)?' · '+new Date(when).toLocaleString():'')+' · Physical feedback unavailable'));
      }
    }
    else if(!source||!latest)card.append(element('p','widget-no-data','No valid stored readings available for this stream.'));
    else{
      const type=source.channel.value_type,value=streamValue(latest,type),formatted=type==='number'?number(value)+(source.channel.unit?' '+source.channel.unit:''):type==='boolean'?(value?w.on_label||'On':w.off_label||'Off'):String(value).slice(0,2000);
      if(w.type==='table'){
        const table=element('table','stream-history-table'),body=document.createElement('tbody');for(const row of valid.slice(-10).reverse()){const tr=document.createElement('tr');tr.append(element('td','',new Date(row.recorded_at).toLocaleTimeString()),element('td','',String(streamValue(row,type)).slice(0,2000)),element('td','',row.quality));body.append(tr);}table.append(body);card.append(table);
      }else if(['status','led'].includes(w.type)){const status=element('div','widget-status'+(value?' is-on':''));if(w.type==='led')status.append(element('span','widget-led'));status.append(element('span','',formatted));card.append(status);}
      else{let shown=formatted;if(w.type==='value'&&w.aggregation&&w.aggregation!=='latest'&&type==='number'){const values=valid.map(r=>r.value_num),n=w.aggregation==='min'?Math.min(...values):w.aggregation==='max'?Math.max(...values):values.reduce((sum,x)=>sum+x/values.length,0);shown=number(n)+' '+source.channel.unit;}card.append(element('p',type==='text'?'widget-text-reading':'widget-reading',shown));
        if(['gauge','progress'].includes(w.type)&&type==='number'&&w.max>w.min){const bar=element('progress','widget-progress');bar.max=1;bar.value=Math.max(0,Math.min(1,(value-w.min)/(w.max-w.min)));bar.setAttribute('aria-label',w.title+' '+shown);card.append(bar);}
        if(w.type==='chart')card.append(element('p','form-help','Line chart source · '+valid.length+' valid stored samples. This protocol test shows the latest value. The Android app includes its own native chart renderer.'));
      }
      card.append(element('p','widget-binding',source.device.label+' / '+source.channel.title+(source.device.config?.mode==='simulation'?' · SIMULATED':'')+' · '+latest.quality));
    }
    $('mobile-widgets').append(card);
  }
  show('mobile-arrange-panel',!!snapshot.can_arrange);if(!dirty){layout=(config.widgets||[]).slice(0,24).map(w=>({id:w.id,columns:w.size?.columns||(w.width==='full'?12:6),height:w.size?.height||0}));renderLayout();}
}
function renderLayout(){
  $('mobile-layout-rows').replaceChildren();const widgets=snapshot?.dashboard?.config?.widgets||[];
  for(let i=0;i<layout.length;i++){
    const row=layout[i],container=element('div','mobile-layout-row');container.append(element('strong','',widgets.find(w=>w.id===row.id)?.title||'Widget'));
    for(const [label,delta]of [['↑',-1],['↓',1]]){const b=element('button','text-button',label);b.type='button';b.disabled=saving||i+delta<0||i+delta>=layout.length;b.setAttribute('aria-label','Move widget '+(delta<0?'up':'down'));b.addEventListener('click',()=>{const [item]=layout.splice(i,1);layout.splice(i+delta,0,item);dirty=true;renderLayout();});container.append(b);}
    for(const [key,label,min,max]of [['columns','Width columns',3,12],['height','Height (0 = auto)',0,960]]){const wrap=element('label','',label),input=document.createElement('input');input.type='number';input.min=String(min);input.max=String(max);input.step='1';input.value=String(row[key]);input.disabled=saving;input.addEventListener('change',()=>{const n=Number(input.value);if(!Number.isInteger(n)||n<min||n>max||key==='height'&&n!==0&&n<160){input.value=String(row[key]);return;}row[key]=n;dirty=true;controls();});wrap.append(input);container.append(wrap);}$('mobile-layout-rows').append(container);
  }controls();
}
function controls(){$('mobile-layout-save').disabled=!dirty||saving;$('mobile-layout-discard').disabled=!dirty||saving;$('mobile-request').disabled=saving||!invitation&&!(grant?.phase==='claiming')||!!grant&&grant.phase!=='claiming';$('mobile-request').textContent=grant?.phase==='claiming'?'Retry connection request':'Request dashboard connection';}
async function refresh(){
  if(!grant?.connectionId||document.hidden)return;const v=version;
  try{const data=await mobileRpc('rs_mobile_dashboard',{p_connection_id:grant.connectionId,p_device_token:grant.token});if(v!==version)return;if(!data?.project?.id)throw new Error('No dashboard was returned.');if(!dirty&&!saving){snapshot=data;render();}text('mobile-status',dirty?'Local arrangement kept. Save or discard it to resume refreshing.':'Connected to the saved dashboard.');error('');}
  catch(err){if(v!==version)return;error(err.message);if([401,403].includes(err.status)){grant=null;saveGrant();show('mobile-connected',false);controls();return;}}
  if(v===version)schedule(refresh);
}
async function pollApproval(){
  if(!grant||grant.connectionId||document.hidden)return;const v=version;
  try{const result=await mobileRpc('rs_pairing_result',{p_request_id:grant.requestId,p_device_token:grant.token});if(v!==version)return;
    if(result.status==='approved'){grant.connectionId=result.connection_id;saveGrant();show('mobile-start',false);show('mobile-connected');await refresh();return;}
    if(['denied','expired','cancelled','revoked'].includes(result.status)){grant=null;invitation=null;saveGrant();show('mobile-code-panel',false);text('mobile-status','This request was '+result.status+'. Ask the browser for a new QR.');controls();return;}
    if(result.match_code){grant.phase='claimed';grant.matchCode=result.match_code;delete grant.invite;saveGrant();text('mobile-match-code',result.match_code);show('mobile-code-panel');controls();}text('mobile-status','Waiting for approval in the original browser.');
  }catch(err){if(v===version){error(err.message);if([401,403].includes(err.status)){if(grant?.phase!=='claiming'){grant=null;invitation=null;saveGrant();}controls();return;}}}
  if(v===version)schedule(pollApproval,2000);
}
$('mobile-connect-form').addEventListener('submit',async event=>{
  event.preventDefault();if(saving||grant&&grant.phase!=='claiming'||!invitation)return;const label=$('mobile-device-name').value.trim();if(!label||label.length>80)return;const v=version;const token=grant?.phase==='claiming'?grant.token:pairingSecret();grant={requestId:invitation.id,token,phase:'claiming',invite:invitation.invite};saveGrant();saving=true;controls();error('');
  try{const result=await mobileRpc('rs_pairing_claim',{p_request_id:invitation.id,p_invite_token:invitation.invite,p_device_token:token,p_device_label:label});if(v!==version)return;grant={requestId:invitation.id,token,phase:'claimed',matchCode:result.match_code};saveGrant();text('mobile-match-code',result.match_code);show('mobile-code-panel');pollApproval();}
  catch(err){if(v===version){error(err.message);if(!err.status)pollApproval();}}
  finally{if(v===version){saving=false;controls();}}
});
$('mobile-layout-save').addEventListener('click',async()=>{
  if(!dirty||saving||!grant||!snapshot)return;const sig=JSON.stringify([snapshot.dashboard.revision,layout]);if(!pendingSave||pendingSave.sig!==sig)pendingSave={sig,id:crypto.randomUUID(),base:snapshot.dashboard.revision,layout:JSON.parse(JSON.stringify(layout))};const job=pendingSave,v=version;saving=true;renderLayout();error('');
  try{await mobileRpc('rs_mobile_arrange',{p_connection_id:grant.connectionId,p_device_token:grant.token,p_base_revision:job.base,p_save_token:job.id,p_layout:job.layout});if(v!==version)return;dirty=false;pendingSave=null;saving=false;await refresh();}
  catch(err){if(v===version)error(err.message);}
  finally{if(v===version){saving=false;renderLayout();}}
});
$('mobile-layout-discard').addEventListener('click',()=>{if(saving)return;dirty=false;pendingSave=null;refresh();});
$('mobile-disconnect').addEventListener('click',async()=>{const old=grant;version++;clearTimeout(timer);grant=null;invitation=null;saveGrant();dirty=false;saving=false;snapshot=null;pendingSave=null;$('mobile-widgets').replaceChildren();show('mobile-connected',false);text('mobile-status','Disconnected. Generate a new QR to connect again.');if(old?.connectionId)try{await mobileRpc('rs_mobile_disconnect',{p_connection_id:old.connectionId,p_device_token:old.token});}catch{error('Local connection cleared. If needed, revoke its entry in the original browser.');}controls();});
document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden){if(grant?.connectionId)refresh();else if(grant)pollApproval();}});addEventListener('pagehide',()=>{clearTimeout(timer);version++;});addEventListener('beforeunload',event=>{if(dirty||saving){event.preventDefault();event.returnValue='';}});
try{if(window.location.hash){invitation=parsePairingLink(window.location.href,window.location.origin);window.history.replaceState(null,'',window.location.pathname);}const raw=sessionStorage.getItem(storeKey);if(raw){const saved=JSON.parse(raw);if(/^[a-f0-9]{64}$/.test(saved.token||'')&&/^[a-f0-9-]{36}$/i.test(saved.requestId||'')){grant=saved;if(saved.phase==='claiming'&&/^[a-f0-9]{64}$/.test(saved.invite||''))invitation={id:saved.requestId,invite:saved.invite};}}}
catch(err){error(err.message);window.history.replaceState(null,'',window.location.pathname);}
if(grant?.connectionId){show('mobile-start',false);show('mobile-connected');refresh();}else if(grant){if(grant.matchCode){show('mobile-code-panel');text('mobile-match-code',grant.matchCode);}controls();pollApproval();}else if(!invitation)$('mobile-request').disabled=true;
