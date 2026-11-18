import { experimentBlueprint, experimentPreview } from './experiment-model.js?v=0.36.1';
import { SENSOR_PRESETS, makeStreamDefinition } from './sensor-catalog.js?v=0.36.1';
import { BUILTIN_DEVICE_TEMPLATES, cleanDeviceTemplate, cleanChannelDefinition, cleanProjectLibrary, templateChannelPlan, matchingGroupDevices, cleanDeviceGroup, cleanBlueprint } from './library-model.js?v=0.36.1';
import { createLibraryStore } from './library-store.js?v=0.36.1';

export function createProjectLibrary({request,friendlyError,getSession,getGeneration,onApplied=async()=>{},onChanged=()=>{},onStageExperiment=async()=>{},onRegisterDevice=()=>{},hasDashboardDraft=()=>false}){
  const $=id=>document.getElementById(id),copy=x=>JSON.parse(JSON.stringify(x));
  const message=(id,text)=>{$(id).textContent=text;$(id).hidden=!text;};
  const text=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
  let project=null,devices=[],channels=[],catalogReady=false,cycle=0,applying=false,templateDraft=null,groupDraft=null,members=new Set(),experiment=null;
  const context=()=>({cycle,generation:getGeneration(),projectId:project?.id});
  const current=c=>getSession()&&c.cycle===cycle&&c.generation===getGeneration()&&c.projectId===project?.id;
  const store=createLibraryStore({request,getSession,getGeneration,onChange:()=>{render();onChanged();}});
  const allTemplates=()=>[...BUILTIN_DEVICE_TEMPLATES,...store.state().document.templates];
  const selectedTemplate=()=>allTemplates().find(t=>t.id+'@'+t.version===$('library-template').value);
  const selectedDevice=()=>devices.find(d=>d.id===$('library-device').value&&d.project_id===project?.id);
  function options(id,rows,value,label,empty){
    const select=$(id),prior=select.value;select.replaceChildren();
    if(empty!==undefined){const op=text('option',empty);op.value='';select.append(op);}
    for(const row of rows){const op=text('option',label(row));op.value=value(row);select.append(op);}
    select.value=rows.some(r=>value(r)===prior)?prior:empty!==undefined?'':rows[0]?value(rows[0]):'';
  }
  function render(){
    const s=store.state();$('library-save').disabled=!s.ready||!s.dirty||s.busy||applying;$('library-discard').disabled=!s.dirty||s.busy||applying;$('library-reload').disabled=s.busy||applying||s.dirty;
    $('library-save').textContent=s.busy?'Saving…':'Save library';$('library-save-state').textContent=s.busy?'Saving project library…':s.dirty?'Unsaved library draft':s.ready?(s.revision?'Saved project library · revision '+s.revision:'No saved project library yet'):'Library not loaded';
    $('library-capture-template').disabled=!s.ready||s.busy||applying||!devices.length;
    $('library-copy-template').disabled=!s.ready||s.busy||applying||!selectedTemplate();$('library-version-template').disabled=!s.ready||s.busy||applying||!selectedTemplate()||selectedTemplate().id.startsWith('builtin:');$('library-new-group').disabled=!s.ready||s.busy||applying;
    const q=$('library-search').value.trim().toLocaleLowerCase(),items=allTemplates().filter(t=>!q||[t.name,t.board_model,...t.channels.map(c=>c.title+' '+c.channel_key)].join(' ').toLocaleLowerCase().includes(q));
    options('library-template',items,t=>t.id+'@'+t.version,t=>t.name+' · v'+t.version+' · '+t.channels.length+' streams');options('library-device',devices,d=>d.id,d=>d.label+' · '+d.board_model);
    $('library-template-count').textContent=items.length+' template versions · data definitions, not installed drivers';
    $('library-group-list').replaceChildren();
    for(const group of s.document.groups){
      const card=document.createElement('article');card.className='library-item';card.append(text('strong',group.name));
      const count=catalogReady?matchingGroupDevices(group,devices,channels,project?.id).length:null;
      card.append(text('p',(group.archived?'Archived · ':group.kind==='manual'?'Manual · ':'Dynamic · ')+(count===null?'Stream counts not verified':count+' matching loaded devices'),'form-help'));
      const edit=text('button','Edit');edit.type='button';edit.className='text-button';edit.disabled=!s.ready||s.busy||applying;edit.addEventListener('click',()=>editGroup(group));
      const archive=text('button',group.archived?'Restore':'Archive');archive.type='button';archive.className='text-button';archive.disabled=edit.disabled;archive.addEventListener('click',()=>{try{const next=store.state().document;next.groups=next.groups.map(g=>g.id===group.id?{...g,archived:!g.archived}:g);store.change(next);}catch(e){message('library-error',e.message);}});card.append(edit,archive);$('library-group-list').append(card);
    }
    $('library-groups-empty').hidden=!!s.document.groups.length;
    $('library-blueprint-list').replaceChildren();for(const bp of s.document.blueprints)$('library-blueprint-list').append(text('p',bp.name+' · v'+bp.version+' · '+bp.widgets.length+' widgets','form-help'));
    $('library-blueprints-empty').hidden=!!s.document.blueprints.length;
    preview();$('library-start-experiment').disabled=!s.ready||s.busy||s.dirty||applying||!catalogReady||!selectedTemplate()||!selectedDevice();
  }
  async function loadChannels(c){
    const all=[],seen=new Set();catalogReady=false;
    for(let start=0;start<devices.length;start+=40){
      const ids=devices.slice(start,start+40).map(d=>d.id);
      for(let page=0;page<8;page++){
        const rows=await request('/rest/v1/channels?select=id,device_id,channel_key,title,unit,value_type,direction,config&device_id=in.('+ids.join(',')+')&order=id.asc&limit=500&offset='+page*500,{authenticated:true});
        if(!current(c))return;if(!Array.isArray(rows))throw new Error('Unexpected stream response.');
        for(const row of rows){if(!ids.includes(row.device_id)||seen.has(row.id))throw new Error('Stream paging could not be verified. Refresh the library before applying templates.');seen.add(row.id);all.push(row);}
        if(rows.length<500)break;if(page===7)throw new Error('Too many streams for this library view. No partial counts or template changes were applied.');
      }
    }
    if(current(c)){channels=all;catalogReady=true;render();onChanged();}
  }
  async function open(nextProject,nextDevices){
    if(project?.id!==nextProject.id){reset();project=nextProject;}
    devices=nextDevices.filter(d=>d.project_id===project.id);const c=context();message('library-error','');$('library-project-name').textContent=project.name;
    try{await store.open(project);if(!current(c))return;await loadChannels(c);}catch(e){if(current(c))message('library-error',e.status||e.name==='TypeError'||e.name==='AbortError'?friendlyError(e,'The project library could not be loaded. Existing dashboards remain available.'):e.message);}if(current(c))render();
  }
  function reset(){cycle++;project=null;devices=[];channels=[];catalogReady=applying=false;templateDraft=groupDraft=null;members.clear();store.reset();$('library-search').value='';$('blueprint-capture-experiment').checked=false;$('experiment-plan').replaceChildren();$('experiment-context').textContent='';$('experiment-summary').textContent='';message('experiment-error','');$('library-project-name').textContent='';message('library-error','');message('library-notice','');experiment=null;for(const id of ['library-template-dialog','library-group-dialog','experiment-dialog'])if($(id).open)$(id).close();$('library-template-name').value='';$('library-group-name').value='';$('library-group-query').value='';$('library-group-channel').value='';for(const id of ['library-template-streams','library-group-members','library-group-board','library-template-board'])$(id).replaceChildren();}
  function preview(){
    $('library-template-plan').replaceChildren();$('library-apply-template').disabled=true;
    const t=selectedTemplate(),d=selectedDevice(),s=store.state();if(!t||!d){$('library-plan-summary').textContent='Choose a template version and target device.';return;}
    if(!catalogReady){$('library-plan-summary').textContent='Refresh the project streams before previewing changes.';return;}
    try{
      const plan=templateChannelPlan(t,d,channels,project.id);for(const step of plan)$('library-template-plan').append(text('li',({add:'Add missing',reuse:'Reuse existing ID',conflict:'Conflict — kept unchanged'}[step.status])+' · '+step.definition.title+' · '+step.definition.channel_key+' · '+step.definition.value_type+' '+step.definition.unit));
      const conflict=plan.some(p=>p.status==='conflict'),add=plan.filter(p=>p.status==='add').length;
      $('library-plan-summary').textContent=(conflict?'Resolve incompatible keys before applying. ':add+' missing streams; '+(plan.length-add)+' existing streams reused. ')+(s.dirty?'Save or discard the library draft first. ':'')+'This does not install firmware or pair the board.';
      $('library-apply-template').disabled=conflict||!add||!s.ready||s.busy||s.dirty||applying;
    }catch(e){$('library-plan-summary').textContent=e.message;}
  }
  async function applyTemplate(){
    if(applying||$('library-apply-template').disabled||!getSession())return;
    const t=selectedTemplate(),d=selectedDevice(),c=context();if(!t||!d)return;applying=true;render();let added=0;
    try{
      await loadChannels(c);if(!current(c))return;
      const plan=templateChannelPlan(t,d,channels,project.id);if(plan.some(p=>p.status==='conflict'))throw new Error('A stream key now conflicts. Existing streams were kept; review the preview.');
      for(const step of plan){
        if(!current(c))return;if(step.status==='reuse')continue;
        const def=step.definition,body={id:crypto.randomUUID(),device_id:d.id,...def,config:{...def.config,simulation:d.config?.mode==='simulation',template_ref:{id:t.id,version:t.version}}};
        await request('/rest/v1/channels?on_conflict=device_id,channel_key',{method:'POST',authenticated:true,prefer:'resolution=ignore-duplicates,return=minimal',body});if(!current(c))return;
        const rows=await request('/rest/v1/channels?select=id,device_id,channel_key,title,unit,value_type,direction,config&device_id=eq.'+encodeURIComponent(d.id)+'&channel_key=eq.'+encodeURIComponent(def.channel_key),{authenticated:true});if(!current(c))return;
        if(!Array.isArray(rows)||rows.length!==1||templateChannelPlan({...t,channels:[def]},d,rows,project.id)[0].status!=='reuse')throw new Error('A stream save could not be verified. Retry this version to reuse saved keys.');added++;
      }
      message('library-notice','Template v'+t.version+' applied · '+added+' missing streams confirmed. Existing stream IDs and readings were retained.');await onApplied(d.id);if(current(c))await loadChannels(c);
    }catch(e){if(current(c)){message('library-error',(added?added+' stream saves confirmed before this stopped. ':'')+(e.status||e.name==='TypeError'||e.name==='AbortError'?friendlyError(e,'Template application stopped. Retry the same version to reuse saved stream keys.'):e.message));try{await loadChannels(c);}catch{catalogReady=false;}}}
    finally{if(current(c)){applying=false;render();}}
  }
  const readDashboard=async()=>{const rows=await request('/rest/v1/widgets?select=id,project_id,widget_type,title,config,revision&id=eq.'+encodeURIComponent(project.id)+'&project_id=eq.'+encodeURIComponent(project.id),{authenticated:true});if(!Array.isArray(rows)||rows.length>1)throw new Error('The Dashboard could not be verified.');return rows[0]||null;};
  function layoutWidgets(row){if(!row)return [];const cfg=row.config;if(row.project_id!==project.id||row.id!==project.id||row.widget_type!=='note'||!Number.isInteger(row.revision)||row.revision<1||!cfg||cfg.kind!=='dashboard_layout'||![1,2,3].includes(cfg.schema_version)||!Array.isArray(cfg.widgets))throw new Error('This Dashboard format needs review. No experiment changes were applied.');return cfg.widgets;}
  async function reviewExperiment(){
    if(applying||!project||!getSession())return;const c=context();applying=true;experiment=null;render();message('library-error','');
    try{
      if(store.state().dirty||hasDashboardDraft())throw new Error('Save or discard your library and Dashboard drafts before starting an experiment.');
      const t=copy(selectedTemplate()),d=copy(selectedDevice()),b=experimentBlueprint(t,store.state().saved.blueprints);await loadChannels(c);if(!current(c))return;
      const row=await readDashboard();if(!current(c))return;const plan=experimentPreview(t,b,d,channels,project.id,layoutWidgets(row));
      experiment={template:t,device:d,blueprint:b,review:JSON.stringify(row)};
      $('experiment-context').textContent=project.name+' → '+d.label+' · '+t.name+' v'+t.version;
      $('experiment-plan').replaceChildren();for(const item of plan.streams)$('experiment-plan').append(text('li',(item.status==='reuse'?'Reuse existing stream ID':'Add missing stream')+' · '+item.definition.title+' ('+item.definition.channel_key+')'));
      for(const step of plan.steps)$('experiment-plan').append(text('li',(step.status==='reuse'?'Keep existing card':'Add missing card')+' · '+step.widget.title));
      $('experiment-summary').textContent=plan.streams.filter(p=>p.status==='add').length+' new streams · '+plan.additions.length+' new cards · '+(plan.steps.length-plan.additions.length)+' cards reused. Existing readings, rules and groups are kept. '+(d.config?.mode==='simulation'?'Simulation: samples start only when you choose Run sensor test.':t.channels.some(c=>c.channel_key==='pot_raw')?'ESP32 starter available; wiring and firmware verification remain separate.':'Data setup only; a compatible sensor sketch and ingestion adapter are required.');
      message('experiment-error','');$('experiment-apply').disabled=false;$('experiment-dialog').showModal();
    }catch(e){if(current(c))message('library-error',(e.status||e.name==='TypeError'||e.name==='AbortError')?friendlyError(e,'The experiment could not be reviewed.'):e.message);}
    finally{if(current(c)){applying=false;render();}}
  }
  async function applyExperiment(){
    if(applying||!experiment||!getSession())return;const c=context(),job=copy(experiment);applying=true;$('experiment-apply').disabled=true;render();
    try{
      if(store.state().dirty||hasDashboardDraft())throw new Error('Save or discard your drafts first.');
      const row=await readDashboard();if(!current(c))return;if(JSON.stringify(row)!==job.review)throw new Error('The Dashboard changed after review. Close and review this experiment again.');
      const fresh=await request('/rest/v1/devices?select=id,project_id,label,board_model,config&id=eq.'+job.device.id+'&project_id=eq.'+project.id,{authenticated:true});if(!current(c))return;
      if(!Array.isArray(fresh)||fresh.length!==1||fresh[0].project_id!==project.id||fresh[0].id!==job.device.id||fresh[0].board_model!==job.device.board_model)throw new Error('This device changed or is unavailable. Review the experiment again.');
      await loadChannels(c);if(!current(c))return;const steps=templateChannelPlan(job.template,fresh[0],channels,project.id);if(steps.some(s=>s.status==='conflict'))throw new Error('A stream key now conflicts. Existing streams were retained.');
      for(const step of steps){if(step.status==='reuse')continue;if(!current(c))return;
        await request('/rest/v1/channels?on_conflict=device_id,channel_key',{method:'POST',authenticated:true,prefer:'resolution=ignore-duplicates,return=minimal',body:{id:crypto.randomUUID(),device_id:job.device.id,...step.definition,config:{...step.definition.config,simulation:fresh[0].config?.mode==='simulation',template_ref:{id:job.template.id,version:job.template.version}}}});if(!current(c))return;
      }
      await loadChannels(c);if(!current(c))return;if(templateChannelPlan(job.template,fresh[0],channels,project.id).some(s=>s.status!=='reuse'))throw new Error('Some stream saves could not be verified. Close and review again to reuse confirmed keys.');
      $('experiment-dialog').close();await onStageExperiment({...job.blueprint,primaryKey:job.template.channels[0].channel_key},job.device,job.review);if(!current(c))return;experiment=null;message('library-notice','Experiment streams confirmed. Review the Dashboard draft and Save dashboard to sync cards to Android.');
    }catch(e){if(current(c))message($('experiment-dialog').open?'experiment-error':'library-error',(e.status||e.name==='TypeError'||e.name==='AbortError')?friendlyError(e,'The experiment stopped. Saved streams are retained. Close and review again before retrying.'):e.message+' Any confirmed streams are retained. Close and review again to reuse them.');}
    finally{if(current(c)){applying=false;$('experiment-apply').disabled=false;render();}}
  }
  function addBlueprint(blueprint,experimentDeviceId){
    const b=cleanBlueprint(blueprint),doc=store.state().document;
    if(experimentDeviceId){
      const d=devices.find(d=>d.id===experimentDeviceId&&d.project_id===project?.id);if(!catalogReady||!d)throw new Error('Refresh the project library before capturing an experiment.');
      const keys=new Set(b.widgets.filter(w=>w.source_key).map(w=>w.source_key)),defs=channels.filter(c=>c.device_id===d.id&&keys.has(c.channel_key));
      if(!defs.length||keys.has('$selected'))throw new Error('Choose a device with bound sensor cards to capture an experiment.');
      const template=cleanDeviceTemplate({id:crypto.randomUUID(),version:1,name:b.name,board_model:d.board_model,blueprint_ref:{id:b.id,version:b.version},channels:defs.map(c=>({...c,config:{...c.config,min:Number.isFinite(c.config?.min)?c.config.min:0,max:Number.isFinite(c.config?.max)?c.config.max:100}}))});doc.templates.push(template);
    }
    doc.blueprints.push(b);store.change(cleanProjectLibrary(doc));message('library-notice',experimentDeviceId?'Experiment and linked blueprint added to the library draft. Save library to reuse them.':'Blueprint added to the library draft. Save library to keep it.');
  }
  $('experiment-dialog').addEventListener('cancel',event=>{if(applying)event.preventDefault();});
  $('library-start-experiment').addEventListener('click',reviewExperiment);$('experiment-apply').addEventListener('click',applyExperiment);$('library-register-device').addEventListener('click',()=>{if(!applying)onRegisterDevice();});
  function renderTemplateDraft(){
    $('library-template-streams').replaceChildren();for(const def of templateDraft?.channels||[]){const row=document.createElement('div');row.className='library-stream-row';row.append(text('span',def.title+' · '+def.channel_key+' · '+def.value_type+' '+def.unit));const remove=text('button','Remove');remove.type='button';remove.className='text-button';remove.addEventListener('click',()=>{templateDraft.channels=templateDraft.channels.filter(c=>c.channel_key!==def.channel_key);renderTemplateDraft();});row.append(remove);$('library-template-streams').append(row);}
    $('library-template-version').textContent='New immutable version '+(templateDraft?.version||1)+' · Existing devices are not updated automatically.';
  }
  function editTemplate(kind){
    if(!store.state().ready||store.state().busy||applying)return;
    const selected=selectedTemplate(),device=selectedDevice();
    try{
      if(kind==='device'){
        if(!catalogReady||!device)throw new Error('Choose a device and refresh its streams.');
        const defs=channels.filter(c=>c.device_id===device.id&&c.direction==='input').map(c=>{const p=SENSOR_PRESETS.find(p=>p.key===c.channel_key);return cleanChannelDefinition({...c,config:{...c.config,min:Number.isFinite(c.config?.min)?c.config.min:p?.min??0,max:Number.isFinite(c.config?.max)?c.config.max:p?.max??100}});});
        templateDraft={id:crypto.randomUUID(),version:1,name:device.label+' template',board_model:device.board_model,channels:defs.slice(0,16)};
        if(defs.length>16)throw new Error('This template editor supports up to 16 input streams.');
      }else{
        if(!selected)throw new Error('Choose a template first.');templateDraft=copy(selected);
        if(kind==='version'&&!selected.id.startsWith('builtin:'))templateDraft.version=Math.max(...store.state().document.templates.filter(t=>t.id===selected.id).map(t=>t.version))+1;
        else{templateDraft.id=crypto.randomUUID();templateDraft.version=1;templateDraft.name+=' copy';}
      }
      $('library-template-name').value=templateDraft.name;options('library-template-board',[...new Set(['ESP32','ESP32-S3 DevKitC-1','ESP32-C3 DevKitM-1','ESP8266','Arduino Uno','Arduino Uno R3','Raspberry Pi Pico W','Other',templateDraft.board_model,...devices.map(d=>d.board_model)])],x=>x,x=>x);$('library-template-board').value=templateDraft.board_model;options('library-template-preset',SENSOR_PRESETS,p=>p.key,p=>p.title+' · '+p.value_type);renderTemplateDraft();message('library-template-error','');$('library-template-dialog').showModal();
    }catch(e){message('library-error',e.message);}
  }
  function editGroup(group){
    if(!store.state().ready||store.state().busy||applying)return;
    groupDraft=group?copy(group):{id:crypto.randomUUID(),name:'',kind:'manual',members:[],archived:false};members=new Set(groupDraft.members||[]);
    $('library-group-name').value=groupDraft.name;$('library-group-kind').value=groupDraft.kind;$('library-group-mode').value=groupDraft.rule?.mode||'all';$('library-group-query').value=groupDraft.rule?.query||'';$('library-group-channel').value=groupDraft.rule?.channel_key||'';
    options('library-group-board',[...new Set(devices.map(d=>d.board_model))],x=>x,x=>x,'Any board');$('library-group-board').value=groupDraft.rule?.board_model||'';
    $('library-group-members').replaceChildren();for(const d of devices){const label=document.createElement('label');label.className='library-member';const input=document.createElement('input');input.type='checkbox';input.checked=members.has(d.id);input.addEventListener('change',()=>{input.checked?members.add(d.id):members.delete(d.id);groupPreview();});label.append(input,text('span',d.label+' · '+d.board_model));$('library-group-members').append(label);}
    message('library-group-error','');groupPreview();$('library-group-dialog').showModal();
  }
  function groupValue(){return cleanDeviceGroup({id:groupDraft.id,name:$('library-group-name').value.trim()||'Group preview',kind:$('library-group-kind').value,archived:groupDraft.archived,members:[...members],rule:{mode:$('library-group-mode').value,board_model:$('library-group-board').value,query:$('library-group-query').value.trim(),channel_key:$('library-group-channel').value.trim()}});}
  function groupPreview(){const dynamic=$('library-group-kind').value==='dynamic';$('library-group-manual').hidden=dynamic;$('library-group-dynamic').hidden=!dynamic;try{$('library-group-preview').textContent=catalogReady?matchingGroupDevices(groupValue(),devices,channels,project?.id).length+' of '+devices.length+' loaded project devices match.':'Refresh project streams before checking dynamic counts.';}catch(e){$('library-group-preview').textContent=e.message;}}
  $('library-template').addEventListener('change',()=>{render();preview();});$('library-device').addEventListener('change',preview);$('library-search').addEventListener('input',render);
  $('library-apply-template').addEventListener('click',applyTemplate);$('library-copy-template').addEventListener('click',()=>editTemplate('copy'));$('library-version-template').addEventListener('click',()=>editTemplate('version'));$('library-capture-template').addEventListener('click',()=>editTemplate('device'));
  $('library-template-add-stream').addEventListener('click',()=>{if(!templateDraft)return;const def=cleanChannelDefinition(makeStreamDefinition($('library-template-preset').value));if(templateDraft.channels.some(c=>c.channel_key===def.channel_key))return;if(templateDraft.channels.length>=16){message('library-template-error','A template can hold up to 16 streams.');return;}templateDraft.channels.push(def);renderTemplateDraft();});
  $('library-template-form').addEventListener('submit',event=>{event.preventDefault();if(!templateDraft)return;try{const t=cleanDeviceTemplate({...templateDraft,name:$('library-template-name').value.trim(),board_model:$('library-template-board').value}),doc=store.state().document;if(doc.templates.some(x=>x.id===t.id&&x.version===t.version))throw new Error('This immutable version already exists. Create a new version.');doc.templates.push(t);store.change(doc);$('library-template-dialog').close();templateDraft=null;message('library-notice','Template version added to your library draft. Save library to keep it.');}catch(e){message('library-template-error',e.message);}});
  $('library-new-group').addEventListener('click',()=>editGroup());for(const id of ['library-group-kind','library-group-mode','library-group-board'])$(id).addEventListener('change',groupPreview);for(const id of ['library-group-query','library-group-channel'])$(id).addEventListener('input',groupPreview);
  $('library-group-form').addEventListener('submit',event=>{event.preventDefault();if(!groupDraft)return;try{if(!$('library-group-name').value.trim())throw new Error('Enter a group name.');const g=groupValue(),doc=store.state().document;doc.groups=doc.groups.some(x=>x.id===g.id)?doc.groups.map(x=>x.id===g.id?g:x):[...doc.groups,g];store.change(doc);$('library-group-dialog').close();groupDraft=null;message('library-notice','Group added to the library draft. Save library to keep it.');}catch(e){message('library-group-error',e.message);}});
  $('library-save').addEventListener('click',async()=>{const c=context();try{const saved=await store.save();if(current(c)&&saved)message('library-notice','Project library saved. Dashboard and stream IDs are unchanged.');}catch(e){if(current(c))message('library-error',e.status||e.name==='TypeError'||e.name==='AbortError'?friendlyError(e,'Library save could not be confirmed. Retry Save library safely.'):e.message);}});
  $('library-discard').addEventListener('click',()=>{store.discard();message('library-error','');message('library-notice','Library draft discarded.');});$('library-reload').addEventListener('click',async()=>{const c=context();try{await store.reload();if(!current(c))return;await loadChannels(c);if(current(c))message('library-error','');}catch(e){if(current(c))message('library-error',e.status||e.name==='TypeError'||e.name==='AbortError'?friendlyError(e,'Library reload failed.'):e.message);}});
  return {open,reset,hasPendingChanges:()=>store.state().dirty||store.state().busy||applying,warnBeforeLeave:()=>message('library-notice','Save or discard your library draft before leaving this project.'),blocksClose:id=>['library-template-dialog','library-group-dialog','experiment-dialog'].includes(id)&&(store.state().busy||applying),snapshot:()=>({...store.state().saved,ready:store.state().ready,catalogReady,channels:copy(channels)}),addBlueprint,store};
}
