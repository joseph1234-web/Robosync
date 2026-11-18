import { normalizeThresholdRule, evaluateThresholdRule } from './rule-engine.js?v=0.36.1';
export function createRules({request,friendlyError,getSession,getGeneration,onViewEvents}) {
  const $=id=>document.getElementById(id),clone=v=>JSON.parse(JSON.stringify(v));
  const show=(id,on=true)=>{$(id).hidden=!on;};
  const message=(id,text)=>{$(id).textContent=text;show(id,!!text);};
  const select='id,project_id,name,enabled,config,revision';
  let project=null,devices=[],channels=[],rules=[],version=0,listVersion=0,previewVersion=0;
  let saving=false,toggling=false,savingEvents=false,loading=false,editId=null,editRevision=0,pendingSave=null,preview=null;
  const context=()=>({version,generation:getGeneration(),projectId:project?.id});
  const current=ctx=>project&&getSession()&&ctx.version===version&&ctx.generation===getGeneration()&&ctx.projectId===project.id;
  const asRows=v=>{if(!Array.isArray(v))throw new Error('Unexpected database response');return v;};
  function localError(text){const err=new Error(text);err.code='RULE_LOCAL';return err;}
  function describeError(err,fallback){return ['RULE_FORMAT','RULE_LOCAL'].includes(err.code)?err.message:friendlyError(err,fallback);}
  function normalize(row){
    if(!row||row.project_id!==project?.id||!Number.isInteger(row.revision)||row.revision<1)throw localError('This rule record is not supported. It has not been changed.');
    return normalizeThresholdRule(row.config);
  }
  function binding(cfg){const mode=cfg.schema_version===2?'hardware':'simulation';const device=devices.find(d=>d.id===cfg.device_id&&d.config?.mode===mode);const channel=channels.find(c=>c.id===cfg.channel_id&&c.device_id===device?.id&&c.value_type==='number'&&(mode==='simulation'||c.direction==='input'));return device&&channel?{device,channel}:null;}
  function sourceDescription(cfg){return cfg.schema_version===2?'Hardware readings · Browser manual replay':'Simulation only · No background monitoring';}
  async function verifiedBinding(cfg){
    if(cfg.schema_version!==2)return binding(cfg);
    const [ds,cs]=await Promise.all([
      request('/rest/v1/devices?select=id,project_id,label,config&id=eq.'+encodeURIComponent(cfg.device_id)+'&project_id=eq.'+encodeURIComponent(project.id),{authenticated:true}),
      request('/rest/v1/channels?select=id,device_id,channel_key,title,unit,value_type,direction&id=eq.'+encodeURIComponent(cfg.channel_id)+'&device_id=eq.'+encodeURIComponent(cfg.device_id),{authenticated:true})
    ]);
    const device=asRows(ds).find(d=>d.id===cfg.device_id&&d.project_id===project?.id&&d.config?.mode==='hardware');
    const channel=asRows(cs).find(c=>c.id===cfg.channel_id&&c.device_id===device?.id&&c.value_type==='number'&&c.direction==='input');
    return device&&channel?{device,channel}:null;
  }
  function explain(cfg,unit=''){
    return `IF the value stays ${cfg.operator} ${cfg.threshold}${unit?' '+unit:''} for at least ${cfg.hold_seconds} seconds of qualifying samples, THEN log a ${cfg.action.severity} event. Reset when it is ${cfg.operator==='above'?'at or below':'at or above'} ${cfg.reset_threshold}${unit?' '+unit:''}. Wait at least ${cfg.cooldown_seconds} seconds between triggers. Invalid samples or gaps over ${cfg.max_gap_seconds} seconds restart the test state.`;
  }
  function reset(){version++;listVersion++;previewVersion++;project=null;devices=[];channels=[];rules=[];saving=false;toggling=false;savingEvents=false;loading=false;editId=null;editRevision=0;pendingSave=null;preview=null;$('rules-list').replaceChildren();$('rule-test-timeline').replaceChildren();message('rules-error','');message('rules-notice','');
    for(const id of ['rule-dialog','rule-preview-dialog'])if($(id).open)$(id).close();
    $('rules-setup-check').textContent='6';$('rules-setup-check').classList.toggle('pending',true);$('rules-setup-text').textContent='Create a rule, preview saved readings, and choose whether to save test events.';
  }
  function busy(){return saving||toggling||savingEvents;}
  function controls(){for(const id of ['rules-add','rules-first','rules-refresh'])$(id).disabled=busy()||loading;$('rule-save').disabled=saving;$('rule-save').textContent=saving?'Saving…':'Save rule ↗';}
  function render(){
    $('rules-list').replaceChildren();show('rules-empty',rules.length===0);
    for(const row of rules){
      let cfg=null,problem='';try{cfg=normalize(row);}catch(err){problem=describeError(err,'Unsupported rule format.');}
      const bound=cfg?binding(cfg):null,card=document.createElement('article');card.className='rule-card';card.setAttribute('data-rule-id',row.id);
      const top=document.createElement('div');top.className='rule-card-top';const intro=document.createElement('div');const title=document.createElement('h3');title.textContent=row.name;const source=document.createElement('p');source.className='rule-source';source.textContent=bound?bound.device.label+' / '+bound.channel.title:'Saved source unavailable';intro.append(title,source);
      const badge=document.createElement('span');badge.className='rule-state'+(row.enabled?'':' paused');badge.textContent=row.enabled?'READY FOR MANUAL TESTS':'PAUSED';top.append(intro,badge);card.append(top);
      const text=document.createElement('p');text.className='rule-text';text.textContent=problem||explain(cfg,bound?.channel.unit||'');card.append(text);
      const bottom=document.createElement('div');bottom.className='rule-card-bottom';const note=document.createElement('span');note.textContent=cfg?sourceDescription(cfg):'Unsupported saved format';bottom.append(note);const actions=document.createElement('div');actions.className='rule-card-actions';
      const button=(label,fn,style,disabled)=>{const b=document.createElement('button');b.type='button';b.className=style;b.textContent=label;b.disabled=disabled||busy();b.addEventListener('click',fn);actions.append(b);};
      button(row.enabled?'Pause':'Enable',()=>toggle(row),'text-button',!cfg);button('Edit rule',()=>editRule(row),'text-button',!cfg);button('Preview test',()=>previewRule(row),'button secondary',!cfg||!bound||!row.enabled);
      bottom.append(actions);card.append(bottom);$('rules-list').append(card);
    }
    controls();
    $('rules-setup-check').textContent=rules.length?'✓':'6';$('rules-setup-check').classList.toggle('pending',!rules.length);$('rules-setup-text').textContent=rules.length?'Your rule is saved. Preview a test to review its events.':'Create a rule, preview saved readings, and choose whether to save test events.';
  }
  async function readRule(id){return asRows(await request('/rest/v1/rules?select='+select+'&id=eq.'+encodeURIComponent(id)+'&project_id=eq.'+encodeURIComponent(project.id),{authenticated:true}))[0]||null;}
  async function loadRules(){
    if(!project)return;const ctx=context(),load=++listVersion;loading=true;show('rules-loading');controls();
    try{const data=asRows(await request('/rest/v1/rules?select='+select+'&project_id=eq.'+encodeURIComponent(project.id)+'&order=name.asc&limit=100',{authenticated:true}));if(!current(ctx)||load!==listVersion)return;rules=data;message('rules-error','');render();}
    catch(err){if(current(ctx)&&load===listVersion)message('rules-error',describeError(err,'Couldn’t load rules. Try Refresh rules.'));}
    finally{if(current(ctx)&&load===listVersion){loading=false;show('rules-loading',false);controls();}}
  }
  async function open(nextProject,nextDevices){
    if(project?.id!==nextProject.id){reset();project=nextProject;}
    devices=nextDevices.filter(d=>d.project_id===project.id&&['simulation','hardware'].includes(d.config?.mode));const ctx=context();
    const catalog=(async()=>{const all=[];for(let i=0;i<devices.length;i+=40){const ids=devices.slice(i,i+40).map(d=>d.id);const data=asRows(await request('/rest/v1/channels?select=id,device_id,channel_key,title,unit,value_type,direction&device_id=in.('+ids.join(',')+')&order=title.asc&limit=1000',{authenticated:true}));if(!current(ctx))return;all.push(...data);}if(current(ctx))channels=all.filter(c=>c.value_type==='number'&&devices.some(d=>d.id===c.device_id&&(d.config.mode==='simulation'||c.direction==='input')));})();
    const results=await Promise.allSettled([loadRules(),catalog]);if(!current(ctx))return;for(const r of results)if(r.status==='rejected')message('rules-error',describeError(r.reason,'Couldn’t load sensor sources. Reopen Rules to retry.'));render();
  }
  function sourceOptions(deviceId,channelId){$('rule-device').replaceChildren();for(const d of devices){const option=document.createElement('option');option.value=d.id;option.textContent=d.label+(d.config.mode==='hardware'?' · Hardware readings':' · Simulation');$('rule-device').append(option);}$('rule-device').value=devices.some(d=>d.id===deviceId)?deviceId:devices[0]?.id||'';streamOptions(channelId);}
  function streamOptions(channelId){const available=channels.filter(c=>c.device_id===$('rule-device').value);$('rule-channel').replaceChildren();for(const c of available){const option=document.createElement('option');option.value=c.id;option.textContent=c.title+(c.unit?' ('+c.unit+')':'');$('rule-channel').append(option);}$('rule-channel').value=available.some(c=>c.id===channelId)?channelId:available.find(c=>c.channel_key==='temperature')?.id||available[0]?.id||'';}
  function formConfig(){
    const keys=['threshold','reset','hold','cooldown','gap'];for(const key of keys)if(!$('rule-'+key).value.trim())throw localError('Complete the trigger, reset, hold time, cooldown, and sample-gap fields.');
    const hardware=devices.find(d=>d.id===$('rule-device').value)?.config.mode==='hardware';
    return normalizeThresholdRule({kind:'threshold',schema_version:hardware?2:1,simulation_only:!hardware,...(hardware?{source_mode:'hardware',execution:'manual_replay'}:{}),device_id:$('rule-device').value,channel_id:$('rule-channel').value,operator:$('rule-operator').value,threshold:Number($('rule-threshold').value),reset_threshold:Number($('rule-reset').value),hold_seconds:Number($('rule-hold').value),cooldown_seconds:Number($('rule-cooldown').value),max_gap_seconds:Number($('rule-gap').value),action:{type:'event',severity:$('rule-severity').value,title:$('rule-event-title').value.trim()}});
  }
  function formExplanation(){const device=devices.find(d=>d.id===$('rule-device').value),channel=channels.find(c=>c.id===$('rule-channel').value&&c.device_id===device?.id),hardware=device?.config.mode==='hardware';show('rule-pot-example',hardware&&channel?.channel_key==='pot_raw'&&channel.unit==='raw');$('rule-source-hint').textContent=hardware?'Hardware saved readings. Run this test in the browser after uploading samples. Estimated timestamps keep their quality label. This rule does not run on your ESP32 or phone.':'Simulation saved readings. The existing simulation test format is retained.';try{const cfg=formConfig(),bound=binding(cfg);$('rule-explanation').textContent=explain(cfg,bound?.channel.unit||'');}catch(err){$('rule-explanation').textContent=describeError(err,'Complete the rule settings to see its explanation.');}}
  function usePotExample(){const device=devices.find(d=>d.id===$('rule-device').value),channel=channels.find(c=>c.id===$('rule-channel').value&&c.device_id===device?.id);if(device?.config.mode!=='hardware'||channel?.channel_key!=='pot_raw'||channel.unit!=='raw')return;$('rule-name').value='High potentiometer';$('rule-operator').value='above';$('rule-threshold').value='3000';$('rule-reset').value='2800';$('rule-hold').value='0';$('rule-cooldown').value='30';$('rule-gap').value='30';$('rule-severity').value='warning';$('rule-event-title').value='Potentiometer is above 3000 raw';formExplanation();}
  function editRule(row=null){
    if(busy())return;if(!devices.length||!channels.length){message('rules-error','Add a device and a numeric input stream in Devices & data first.');return;}
    let cfg=null;if(row){try{cfg=normalize(row);}catch(err){message('rules-error',describeError(err));return;}}
    editId=row?.id||crypto.randomUUID();editRevision=row?.revision||0;pendingSave=null;$('rule-form').reset();$('rule-dialog-title').textContent=row?'Edit your rule.':'Create a rule.';
    $('rule-name').value=row?.name||'High temperature';sourceOptions(cfg?.device_id,cfg?.channel_id);$('rule-operator').value=cfg?.operator||'above';$('rule-threshold').value=String(cfg?.threshold??32);$('rule-reset').value=String(cfg?.reset_threshold??30);$('rule-hold').value=String(cfg?.hold_seconds??30);$('rule-cooldown').value=String(cfg?.cooldown_seconds??60);$('rule-gap').value=String(cfg?.max_gap_seconds??120);$('rule-severity').value=cfg?.action.severity||'warning';$('rule-event-title').value=cfg?.action.title||'Temperature is above the class limit';$('rule-enabled').checked=row?row.enabled:true;message('rule-form-error','');formExplanation();$('rule-dialog').showModal();$('rule-name').focus();
  }
  async function saveRule(event){
    event.preventDefault();if(saving||!project||!editId)return;
    const name=$('rule-name').value.trim();if(!name||name.length>120){message('rule-form-error','Enter a rule name of 1–120 characters.');return;}
    let cfg;try{cfg=formConfig();if(!binding(cfg))throw localError('Choose a numeric input source from this project.');}catch(err){message('rule-form-error',describeError(err));return;}
    const ctx=context(),id=editId,enabled=!!$('rule-enabled').checked,sig=JSON.stringify({name,enabled,cfg});saving=true;controls();message('rule-form-error','');
    try{
      let fresh=await readRule(id);if(!current(ctx))return;
      if(pendingSave&&fresh?.config?.save_token===pendingSave.token){editRevision=fresh.revision;if(pendingSave.signature===sig){$('rule-dialog').close();pendingSave=null;await loadRules();message('rules-notice','Rule saved. Preview test to see what it would record.');return;}}
      if((fresh?.revision||0)!==editRevision)throw localError('This rule changed in another session. Close this form and refresh Rules before editing it again.');
      if(!pendingSave||pendingSave.signature!==sig||pendingSave.revision!==editRevision)pendingSave={token:crypto.randomUUID(),signature:sig,revision:editRevision};
      const job=pendingSave,body={name,enabled,config:{...cfg,save_token:job.token},revision:editRevision+1};
      if(editRevision===0)await request('/rest/v1/rules?on_conflict=id',{method:'POST',authenticated:true,prefer:'resolution=ignore-duplicates,return=minimal',body:{id,project_id:project.id,...body}});
      else await request('/rest/v1/rules?id=eq.'+encodeURIComponent(id)+'&project_id=eq.'+encodeURIComponent(project.id)+'&revision=eq.'+editRevision,{method:'PATCH',authenticated:true,prefer:'return=minimal',body});
      if(!current(ctx))return;fresh=await readRule(id);if(!current(ctx))return;
      if(!fresh||fresh.config?.save_token!==job.token||fresh.revision!==job.revision+1)throw localError('The rule save could not be verified. Retry Save rule to check the same save safely.');
      normalize(fresh);$('rule-dialog').close();pendingSave=null;await loadRules();if(current(ctx))message('rules-notice','Rule saved. Preview test to see what it would record.');
    }catch(err){if(current(ctx))message('rule-form-error',describeError(err,'The rule save could not be confirmed. Retry Save rule to check the same save safely.'));}
    finally{if(current(ctx)){saving=false;render();}}
  }
  async function toggle(row){
    if(busy())return;const ctx=context();toggling=true;render();message('rules-error','');
    try{
      const fresh=await readRule(row.id);if(!current(ctx))return;
      if(!fresh||fresh.revision!==row.revision)throw localError('This rule changed. Refresh Rules before changing its state.');
      const cfg=normalize(fresh),token=crypto.randomUUID();
      await request('/rest/v1/rules?id=eq.'+encodeURIComponent(row.id)+'&project_id=eq.'+encodeURIComponent(project.id)+'&revision=eq.'+row.revision,{method:'PATCH',authenticated:true,prefer:'return=minimal',body:{enabled:!row.enabled,config:{...cfg,save_token:token},revision:row.revision+1}});
      if(!current(ctx))return;const saved=await readRule(row.id);if(!current(ctx))return;
      if(saved?.config?.save_token!==token)throw localError('The state change could not be verified. Refresh Rules to check its current state.');
      await loadRules();if(current(ctx))message('rules-notice',saved.enabled?'Rule enabled for manual saved-reading tests.':'Rule paused. It will not be used for new tests.');
    }catch(err){if(current(ctx))message('rules-error',describeError(err,'Couldn’t confirm the state change. Refresh Rules before trying again.'));}
    finally{if(current(ctx)){toggling=false;render();}}
  }
  function previewControls(){const count=preview?.events?.length||0;$('rule-save-events').disabled=!count||savingEvents||preview?.saved===true;$('rule-save-events').textContent=savingEvents?'Saving events…':preview?.saved?'Test events saved':'Save test events';$('rule-preview-refresh').disabled=savingEvents;$('rule-test-range').disabled=savingEvents;show('rule-view-events',preview?.saved===true);}
  async function previewRule(row){
    if(!row.enabled||busy())return;preview={row:clone(row),events:[],saved:false};$('rule-preview-name').textContent=row.name;$('rule-test-range').value='24';message('rule-preview-error','');message('rule-preview-notice','');$('rule-test-timeline').replaceChildren();$('rule-preview-dialog').showModal();previewControls();await runPreview();
  }
  async function runPreview(){
    if(!preview||savingEvents||!project)return;const ctx=context(),pv=++previewVersion,row=preview.row;
    preview={row,events:[],saved:false};previewControls();message('rule-preview-error','');message('rule-preview-notice','');show('rule-preview-loading');$('rule-test-timeline').replaceChildren();for(const id of ['rule-test-samples','rule-test-triggers','rule-test-resets'])$(id).textContent='—';
    try{
      const fresh=await readRule(row.id);if(!current(ctx)||pv!==previewVersion)return;
      if(!fresh||!fresh.enabled||fresh.revision!==row.revision)throw localError('This rule was paused or changed. Close the preview and refresh Rules.');
      const cfg=normalize(fresh),bound=await verifiedBinding(cfg);if(!current(ctx)||pv!==previewVersion)return;if(!bound)throw localError('The saved source is unavailable. Edit the rule to select a numeric input in this project.');
      const hours=Number($('rule-test-range').value)||24,capturedAt=new Date().toISOString(),since=new Date(Date.parse(capturedAt)-hours*3600000).toISOString();
      const timeFilter='(recorded_at.gte.'+JSON.stringify(since)+',recorded_at.lte.'+JSON.stringify(capturedAt)+')';
      const data=asRows(await request('/rest/v1/telemetry?select=id,channel_id,value_num,recorded_at,received_at,quality&channel_id=eq.'+encodeURIComponent(cfg.channel_id)+'&and='+encodeURIComponent(timeFilter)+'&received_at=lte.'+encodeURIComponent(capturedAt)+'&order=recorded_at.desc,id.desc&limit=100',{authenticated:true}));
      if(!current(ctx)||pv!==previewVersion)return;
      const result=evaluateThresholdRule(cfg,data),testId=crypto.randomUUID();
      const events=result.events.map(item=>({id:crypto.randomUUID(),device_id:cfg.device_id,event_type:item.kind==='trigger'?'rule_test_triggered':'rule_test_reset',severity:item.kind==='trigger'?cfg.action.severity:'info',title:(item.kind==='trigger'?'Rule test triggered: ':'Rule test reset: ')+cfg.action.title,detail:{source:cfg.schema_version===2?'hardware':'simulation',mode:'manual_replay',...(cfg.schema_version===2?{execution:'browser_manual',quality:item.quality}:{}),test_id:testId,rule_id:fresh.id,rule_revision:fresh.revision,channel_id:cfg.channel_id,reading_id:item.reading_id,observed_at:item.at,value:item.value,unit:bound.channel.unit,sample_count:result.samples,excluded_samples:result.excluded,gaps:result.gaps}}));
      preview={row:fresh,cfg,bound,result,events,saved:false};renderPreview();
    }catch(err){if(current(ctx)&&pv===previewVersion)message('rule-preview-error',describeError(err,'Couldn’t preview the rule. Try Preview again.'));}
    finally{if(current(ctx)&&pv===previewVersion){show('rule-preview-loading',false);previewControls();}}
  }
  function dateTime(v){return new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
  function renderPreview(){
    const {result,bound,cfg}=preview,hardware=cfg.schema_version===2;$('rule-preview-name').textContent=preview.row.name+' · '+sourceDescription(cfg);$('rule-test-samples').textContent=String(result.samples);$('rule-test-triggers').textContent=String(result.events.filter(e=>e.kind==='trigger').length);$('rule-test-resets').textContent=String(result.events.filter(e=>e.kind==='reset').length);$('rule-test-timeline').replaceChildren();
    for(const item of result.events){const row=document.createElement('div');row.className='rule-transition';const badge=document.createElement('span');badge.className=item.kind==='reset'?'reset':'';badge.textContent=item.kind.toUpperCase();const p=document.createElement('p');p.textContent=item.value+' '+bound.channel.unit;const time=document.createElement('small');time.textContent='Observed '+dateTime(item.at)+(hardware?' · '+item.quality:'');p.append(time);row.append(badge,p);$('rule-test-timeline').append(row);}
    if(!result.events.length){const p=document.createElement('p');p.className='small-empty-text';p.textContent=result.samples?'The rule did not trigger in these saved samples. Adjust the rule or choose a wider time range.':hardware?'No valid hardware samples in this range. Upload readings from the phone, then Preview again.':'No valid estimated simulation samples in this range. Run a sensor test first or choose a wider range.';$('rule-test-timeline').append(p);}
    $('rule-test-summary').textContent=`${preview.saved?'Saved historical test: '+preview.events.length+' labeled events were verified.':'Preview only: no events written yet.'} Latest ${result.samples+result.excluded} distinct loaded samples, at most 100; earlier readings may be outside this preview. ${result.excluded} samples excluded; ${result.gaps} long gaps restarted the test state. ${hardware?result.estimatedSamples+' samples have estimated timestamps. ':''}Starts inactive, uses observed sample times, and does not interpolate. A saved test is a historical replay, not a live alert. Browser testing does not run on the ESP32 or phone.`;previewControls();
  }
  async function saveTestEvents(){
    if(!preview?.events.length||preview.saved||savingEvents)return;const ctx=context(),pv=previewVersion,batch=preview; savingEvents=true;previewControls();message('rule-preview-error','');
    try{
      const fresh=await readRule(batch.row.id);if(!current(ctx)||pv!==previewVersion)return;
      if(!fresh?.enabled||fresh.revision!==batch.row.revision)throw localError('This rule changed or was paused after the preview. Close this test and refresh Rules before testing again.');
      if(JSON.stringify(normalize(fresh))!==JSON.stringify(batch.cfg))throw localError('The rule definition changed after preview. Close this test and refresh Rules.');
      const bound=await verifiedBinding(batch.cfg);if(!current(ctx)||pv!==previewVersion)return;if(!bound)throw localError('The source changed or is unavailable. Preview the current input before saving test events.');
      await request('/rest/v1/events?on_conflict=id',{method:'POST',authenticated:true,prefer:'resolution=ignore-duplicates,return=minimal',body:batch.events});
      if(!current(ctx)||pv!==previewVersion)return;
      const ids=batch.events.map(e=>e.id),saved=asRows(await request('/rest/v1/events?select=id,device_id,event_type,severity,title,detail&device_id=eq.'+encodeURIComponent(batch.cfg.device_id)+'&id=in.('+ids.join(',')+')',{authenticated:true}));
      if(!current(ctx)||pv!==previewVersion)return;const expected=JSON.parse(JSON.stringify(batch.events));if(!expected.every(e=>{const actual=saved.find(x=>x.id===e.id);return actual&&['device_id','event_type','severity','title'].every(k=>actual[k]===e[k])&&Object.keys(e.detail).every(k=>actual.detail?.[k]===e.detail[k]);}))throw localError('Not all test events could be verified. Retry Save test events to check the same events without duplicates.');
      preview.saved=true;renderPreview();message('rule-preview-notice',ids.length+' labeled test events saved. Open the event log to review or acknowledge them.');
    }catch(err){if(current(ctx)&&pv===previewVersion)message('rule-preview-error',describeError(err,'The event save could not be confirmed. Retry Save test events to reuse the same event IDs.'));}
    finally{if(current(ctx)&&pv===previewVersion){savingEvents=false;previewControls();}}
  }
  for(const id of ['rules-add','rules-first'])$(id).addEventListener('click',()=>editRule());$('rules-refresh').addEventListener('click',loadRules);$('rule-form').addEventListener('submit',saveRule);
  $('rule-device').addEventListener('change',()=>{streamOptions();formExplanation();});$('rule-channel').addEventListener('change',formExplanation);$('rule-pot-example').addEventListener('click',usePotExample);
  for(const id of ['rule-operator','rule-threshold','rule-reset','rule-hold','rule-cooldown','rule-gap','rule-severity','rule-event-title'])$(id).addEventListener('input',formExplanation);
  $('rule-preview-refresh').addEventListener('click',runPreview);$('rule-test-range').addEventListener('change',runPreview);$('rule-save-events').addEventListener('click',saveTestEvents);
  $('rule-view-events').addEventListener('click',()=>{if(!preview?.saved)return;const id=preview.cfg.device_id;$('rule-preview-dialog').close();return onViewEvents(id);});
  addEventListener('beforeunload',event=>{if(busy()){event.preventDefault();event.returnValue='';}});
  return {open,reset,hasPendingChanges:busy,warnBeforeLeave:()=>message('rules-notice','Please wait for the current rule save or test-event save to finish.'),blocksClose:id=>id==='rule-dialog'?saving:id==='rule-preview-dialog'?savingEvents:false};
}
