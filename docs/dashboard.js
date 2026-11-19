import { animateWidget, sampleAdvanced } from './widget-motion.js?v=0.37.0';
import { controlPurposeChoices } from './control-stream-model.js?v=0.37.0';
import { createControlStatusSource } from './control-state.js?v=0.36.1';
import { safeDeviceHealth } from './specialized-model.js?v=0.36.1';
import { behaviorRefs,applyBehavior,validateDashboardBehavior,dashboardTabs,panelParents } from './widget-behavior.js?v=0.36.1';
import { mountBehaviorForm } from './widget-behavior-form.js?v=0.36.1';
import { navigationBar,placePanelNodes } from './dashboard-navigation.js?v=0.36.1';
import { supportsValueText,textSizeChoices,widgetTextPlan,fitWidgetText,gaugeTextSize,decorateWidgetText,watchWidgetText } from './widget-text.js?v=0.36.1';
import { renderWidgetScene } from './widget-visual.js?v=0.37.0';
import { NUMERIC_WIDGETS,iconChoices,widgetSettingValues,applyWidgetSettings,widgetIconId,widgetNumber } from './widget-settings.js?v=0.37.0';
import { phoneLayout,phoneOrder } from './phone-layout.js?v=0.37.0';
import { editPhoneLayout,mountPhoneLayoutEditor } from './dashboard-phone-editor.js?v=0.37.0';
import { phonePreviewCard } from './phone-preview.js?v=0.37.0';
import { streamMappingLabel } from './stream-mapping.js?v=0.36.1';
import { widgetLibraryInventory,filterWidgetLibrary,WIDGET_LIBRARY_GROUPS,librarySeriesOrder } from './widget-library.js?v=0.37.0';
import { applyWidgetAppearance } from './widget-visual.js?v=0.37.0';
import { protectedMedia } from './protected-media.js?v=0.36.1';
import { CONTROL_TYPES, SPECIAL_TYPES, compatibleWidget, createCommandClient, renderOutputControl, phoneColumns } from './io-widgets.js?v=0.38.0';
import { renderSpecial } from './io-display.js?v=0.37.0';
import { patchWidgetReadingTree,widgetSourceRevision } from './stable-widget-refresh.js?v=0.36.1';
import { missingExperimentWidgets } from './experiment-model.js?v=0.36.1';
import { pinSummary } from './stream-pins.js?v=0.36.1';
import { WIDGET_DESIGN } from './widget-design.js?v=0.37.0';
import { readingFreshness,sampleStatus } from './live-refresh.js?v=0.37.0';
import { BUILTIN_BLUEPRINTS, instantiateBlueprint, captureSensorBlueprint, matchingGroupDevices } from './library-model.js?v=0.36.1';
import { THEME_IDS, applySurfaceTheme } from './themes.js?v=0.36.1';
import { createLayoutGestures, normalizeWidgetSize } from './layout-gestures.js?v=0.36.1';
import { streamValue, validStreamReadings, displayStreamNumber } from './sensor-catalog.js?v=0.36.1';
import { createMediaWidgets, validateMediaUrl } from './media-widget.js?v=0.36.1';
// One versioned JSON document keeps a dashboard save atomic within the existing
// widgets table. The canonical record ID equals the project ID. RLS still applies.
export function createDashboard({request,friendlyError,getSession,getGeneration,createControlStream=null,getLibrary=()=>({groups:[],blueprints:[],ready:false}),onCaptureBlueprint=()=>{throw new Error('Load the project library first.');}}) {
  const $=id=>document.getElementById(id);
  const stopTextWatch=watchWidgetText($('dashboard-canvas'));addEventListener('pagehide',stopTextWatch,{once:true});
  const show=(id,on=true)=>{$(id).hidden=!on;};
  const message=(id,text)=>{$(id).textContent=text;show(id,!!text);};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const signature=value=>JSON.stringify(value);
  const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const types=['value','gauge','chart','note','text','status','led','progress','table','camera','heading','divider','panel',...CONTROL_TYPES,...SPECIAL_TYPES];
  const unbound=['note','heading','divider','camera','panel'];let readBehavior=()=>({}),behaviorFormKey='';
  const typeLabels=WIDGET_DESIGN.labels;
  const accepts=(type,ch)=>compatibleWidget(type,ch,devices.find(d=>d.id===ch.device_id));
  const widthColumns={quarter:3,third:4,'5':5,half:6,'7':7,'two-thirds':8,'three-quarters':9,'10':10,'11':11,full:12};
  const stats=['latest','mean','min','max'];
  const maxWidgets=24;
  let project=null,devices=[],channels=[],widgets=[],savedWidgets=[],history=[],dashboardTheme='site',savedTheme='site';
  let datasets=new Map(),revision=0,loaded=false,loadFailed=false,editing=false,dirty=false,saving=false;
  let version=0,dataVersion=0,editId=null,dragId=null,pendingSave=null,insertAt=null;
  let autoPreferred=true,libraryCategory='All',librarySignature='';
  const inventory=()=>widgetLibraryInventory(channels,devices,{projectId:project?.id||''});
  const canCreateControl=type=>!!createControlStream&&devices.some(d=>(!project?.id||d.project_id===project.id)&&controlPurposeChoices(type,d.board_model).length>0);
  async function addControlStream(type,deviceId){const ctx=context(),row=await createControlStream(type,deviceId);if(!row||!current(ctx))return;channels=channels.filter(c=>c.id!==row.id);channels.push(row);librarySignature='';renderLibrary();if(!accepts(type,row)){message('dashboard-notice','The previous output save was confirmed. Choose a matching widget or create the output for this control.');return;}if(!$('widget-dialog').open)newWidget(type);typeOptions(type);$('widget-type').value=type;sourceOptions(row.device_id,row.id);formFields();}
  const phonePreview=()=>$('dashboard-phone-preview').getAttribute('aria-pressed')==='true';
  const phoneWidth=()=>[360,390,412].includes(Number($('dashboard-phone-width').value))?Number($('dashboard-phone-width').value):390;
  const phoneScale=()=>Number($('dashboard-phone-scale').value)===1.5?1.5:1;
  const phoneConfig=()=>({kind:'dashboard_layout',schema_version:3,...layoutExtras,widgets,theme:dashboardTheme});
  const widgetRoots=new Map();
  let layoutExtras={},savedExtras={};const disposers=new Map();const dispose=id=>{for(const f of disposers.get(id)||[])f();disposers.delete(id);};const controlClient=createCommandClient({rpc:(name,body)=>request('/rest/v1/rpc/'+name,{method:'POST',authenticated:true,body}),canUse:()=>active&&!!getSession()&&navigator.onLine!==false});
  let active=false,autoTimer=null,autoVersion=0,refreshing=false,syncTimer=null,syncVersion=0;
  const controlStatus=createControlStatusSource({generation:getGeneration,load:id=>request('/rest/v1/rpc/rs_io_device_status',{method:'POST',authenticated:true,body:{p_device:id}})});
  const layoutSignature=(items=widgets,theme=dashboardTheme,extras=layoutExtras)=>signature({widgets:items,theme,extras});
  const media=createMediaWidgets({canUse:()=>active&&!!project&&!!getSession()});
  const gestures=createLayoutGestures({canvas:$('dashboard-canvas'),canEdit:()=>active&&editing&&!phonePreview()&&!saving&&loaded&&!loadFailed,onAdd:(type,index)=>newWidget(type,index),onMove:move,onResize:resizeWidget,onCancel:render,onAnnounce:text=>{$('dashboard-layout-status').textContent=text;}});
  const phoneGestures=createLayoutGestures({canvas:$('dashboard-canvas'),phoneMode:()=>true,canEdit:()=>active&&editing&&phonePreview()&&!saving&&loaded&&!loadFailed,onAdd:()=>{},onMove:(id,index)=>{const order=phoneOrder(phoneConfig()).filter(w=>w.id!==id);changePhone(id,{before:order[index]?.id||null});},onResize:(id,size)=>changePhone(id,{span:[4,6,12].reduce((best,n)=>Math.abs(n-size.columns)<Math.abs(best-size.columns)?n:best,6),height:size.height}),onCancel:render,onAnnounce:text=>{$('dashboard-layout-status').textContent=text;}});
  function deactivate(){controlStatus.clear();controlClient.stop();for(const id of disposers.keys())dispose(id);widgetRoots.clear();gestures.cancel();phoneGestures.cancel();clearTimeout(syncTimer);syncVersion++;active=false;clearTimeout(autoTimer);autoVersion++;media.stopAll();}
  function queueAuto(){
    clearTimeout(autoTimer);const cycle=++autoVersion;
    if(!active||!project||!getSession()||!$('dashboard-auto-refresh').checked||document.hidden)return;
    autoTimer=setTimeout(async()=>{if(cycle!==autoVersion||!active||!getSession())return;if(!refreshing)await refreshData();if(cycle===autoVersion)queueAuto();},5000);
  }
  function error(text,code){const err=new Error(text);err.code=code;return err;}
  function context(){return {version,generation:getGeneration(),projectId:project?.id};}
  function current(ctx){return !!getSession()&&version===ctx.version&&getGeneration()===ctx.generation&&project?.id===ctx.projectId;}
  function rows(value){if(!Array.isArray(value))throw error('Unexpected database response.','DASHBOARD_RESPONSE');return value;}
  function cleanWidget(w){
    if(!w||!uuidPattern.test(w.id)||!types.includes(w.type)||typeof w.title!=='string'||!w.title.trim()||w.title.length>120)throw error('This saved dashboard contains an unsupported widget.','DASHBOARD_FORMAT');
    let size;try{if(w.size!==undefined)size=normalizeWidgetSize(w.size);}catch(err){throw error(err.message,'DASHBOARD_FORMAT');}
    if(w.theme!==undefined&&!['inherit',...THEME_IDS].includes(w.theme))throw error('The widget theme is not supported.','DASHBOARD_FORMAT');
    const extra={};for(const k of ['phone','design','tab','compact','series','media_id'])if(w[k]!==undefined)extra[k]=clone(w[k]);const base={...clone(w),...extra,id:w.id,type:w.type,title:w.title,width:w.width==='full'?'full':'half',...(size?{size:{...clone(w.size),...size}}:{}),...(w.theme&&w.theme!=='inherit'?{theme:w.theme}:{})};
    if(w.type==='note'){
      if(typeof w.note!=='string'||w.note.length>1000)throw error('The saved note format is not supported.','DASHBOARD_FORMAT');
      return {...base,note:w.note};
    }
    if(['heading','divider','panel'].includes(w.type))return base;
    if(w.type==='camera'){
      if(w.mode==='protected'&&uuidPattern.test(w.media_id)&&uuidPattern.test(w.device_id)&&uuidPattern.test(w.channel_id))return {...base,mode:'protected',media_id:w.media_id,device_id:w.device_id,channel_id:w.channel_id};
      if(!['webcam','snapshot','mjpeg','video','local'].includes(w.mode))throw error('The camera source format is not supported.','DASHBOARD_FORMAT');
      if(w.mode==='webcam')return {...base,mode:w.mode,facing:w.facing==='user'?'user':'environment'};
      if(w.mode==='local')return {...base,mode:w.mode};
      let url;try{url=validateMediaUrl(w.url);}catch(err){throw error(err.message,'DASHBOARD_FORMAT');}return {...base,mode:w.mode,url};
    }
    if(!uuidPattern.test(w.device_id)||!uuidPattern.test(w.channel_id))throw error('The saved stream reference is not supported.','DASHBOARD_FORMAT');
    const binding={...base,device_id:w.device_id,channel_id:w.channel_id,aggregation:stats.includes(w.aggregation)?w.aggregation:'latest'};
    if(['gauge','progress','tank'].includes(w.type)){
      if(typeof w.min!=='number'||typeof w.max!=='number'||!Number.isFinite(w.min)||!Number.isFinite(w.max)||w.min>=w.max||!Number.isFinite(w.max-w.min))throw error('The saved display range is invalid.','DASHBOARD_FORMAT');
      return {...binding,min:w.min,max:w.max};
    }
    if(['status','led'].includes(w.type)){
      const on=w.on_label??'On',off=w.off_label??'Off';if(typeof on!=='string'||typeof off!=='string'||!on.trim()||!off.trim()||on.length>40||off.length>40)throw error('Status labels must contain 1–40 characters.','DASHBOARD_FORMAT');
      return {...binding,on_label:on,off_label:off};
    }
    return binding;
  }
  function parseRecord(row){
    if(!row)return {revision:0,widgets:[],token:null,theme:'site',extras:{}};
    const cfg=row.config;
    if(row.project_id!==project.id||row.widget_type!=='note'||!Number.isInteger(row.revision)||row.revision<1||!cfg||cfg.kind!=='dashboard_layout'||![1,2,3,4].includes(cfg.schema_version)||!Array.isArray(cfg.widgets)||cfg.widgets.length>maxWidgets)throw error('This project’s saved dashboard format is not supported. It has not been changed.','DASHBOARD_FORMAT');
    const extras=Object.fromEntries(Object.entries(cfg).filter(([k])=>!['kind','widgets','theme','save_token'].includes(k)));const parsed=cfg.widgets.map(cleanWidget);if(new Set(parsed.flatMap(behaviorRefs)).size>24)throw error('Keep at most 24 distinct bound streams for a compatible offline dashboard.','DASHBOARD_FORMAT');
    if(new Set(parsed.map(w=>w.id)).size!==parsed.length)throw error('The saved dashboard has duplicate widget IDs. It has not been changed.','DASHBOARD_FORMAT');
    if(cfg.theme!==undefined&&!['site',...THEME_IDS].includes(cfg.theme))throw error('The dashboard theme is not supported.','DASHBOARD_FORMAT');
    return {revision:row.revision,widgets:parsed,token:cfg.save_token||null,theme:cfg.theme||'site',extras};
  }
  function dashboardError(err,fallback){
    if(['DASHBOARD_FORMAT','DASHBOARD_RESPONSE','DASHBOARD_CHANGED','DASHBOARD_SAVE_CHECK'].includes(err.code))return err.message;
    return friendlyError(err,fallback);
  }
  function libraryOptions(id,items,label,empty){
    const select=$(id),prior=select.value;select.replaceChildren();if(empty!==undefined){const op=document.createElement('option');op.value='';op.textContent=empty;select.append(op);}for(const item of items){const op=document.createElement('option');op.value=item.id;op.textContent=label(item);select.append(op);}select.value=items.some(x=>x.id===prior)?prior:empty!==undefined?'':items[0]?.id||'';
  }
  function matchingViewerDevices(){
    if(!project)return [];const groups=getLibrary().groups||[],group=groups.find(g=>g.id===$('dashboard-viewer-group').value&&!g.archived);return group?matchingGroupDevices(group,devices,getLibrary().channels||channels,project.id):devices.filter(d=>d.project_id===project.id);
  }
  function updateViewerOptions(){
    if(!project)return;libraryOptions('dashboard-viewer-group',(getLibrary().groups||[]).filter(g=>!g.archived),g=>g.name,'All project devices');libraryOptions('dashboard-viewer-device',matchingViewerDevices(),d=>d.label,'All matching devices');
    const sections=[...new Set(widgets.map(w=>w.tab).filter(Boolean))],select=$('dashboard-viewer-section'),key=JSON.stringify(sections);if(select.dataset.sections!==key){libraryOptions('dashboard-viewer-section',sections.map(id=>({id})),s=>s.id,'All sections');select.dataset.sections=key;}select.disabled=editing||saving;
    $('dashboard-viewer-group').disabled=editing||saving;$('dashboard-viewer-device').disabled=editing||saving;$('dashboard-project-scope').textContent=project.name;
  }
  function visibleWidgets(){
    const allowed=new Set(matchingViewerDevices().map(d=>d.id)),selected=$('dashboard-viewer-device').value,section=$('dashboard-viewer-section').value;
    const parents=panelParents(widgets);const scoped=editing?widgets:widgets.filter(w=>(!section||(parents.has(w.id)?widgets.find(p=>p.id===parents.get(w.id))?.tab:w.tab)===section)&&(!w.device_id||allowed.has(w.device_id)&&(!selected||selected===w.device_id)));
    if(!phonePreview())return scoped;
    return phoneLayout(phoneConfig(),phoneWidth(),phoneScale(),{section,visibleIds:new Set(scoped.map(w=>w.id)),showHidden:editing}).map(p=>widgets.find(w=>w.id===p.id));
  }
  const blueprintCatalog=()=>[...BUILTIN_BLUEPRINTS,...(getLibrary().blueprints||[])];
  function blueprintFields(){
    const bp=blueprintCatalog().find(b=>b.id===$('blueprint-select').value),type=bp?.widgets.find(w=>w.source_key==='$selected')?.value_type;
    libraryOptions('blueprint-channel',channels.filter(c=>c.device_id===$('blueprint-device').value&&(!type||c.value_type===type)),c=>c.title+(c.unit?' ('+c.unit+')':''));$('blueprint-channel').disabled=!type;blueprintPreview();
  }
  function blueprintPreview(){
    $('blueprint-plan').replaceChildren();$('blueprint-apply').disabled=true;const bp=blueprintCatalog().find(b=>b.id===$('blueprint-select').value);if(!bp){$('blueprint-summary').textContent='Choose a blueprint.';return;}
    try{const d=devices.find(d=>d.id===$('blueprint-device').value),items=instantiateBlueprint(bp,d,channels,project.id,$('blueprint-channel').value);if(widgets.length+items.length>maxWidgets)throw new Error('This would exceed the dashboard limit of 24 widgets. Existing widgets are retained.');for(const w of items){const li=document.createElement('li'),c=channels.find(c=>c.id===w.channel_id);li.textContent=w.title+' · '+w.type+(c?' → '+c.title+' / '+c.channel_key:'');$('blueprint-plan').append(li);}$('blueprint-summary').textContent='Add '+items.length+' widgets to the draft; keep '+widgets.length+' existing widgets. Save dashboard to publish this layout to your paired phone.';$('blueprint-apply').disabled=false;}catch(e){$('blueprint-summary').textContent=e.message;}
  }
  function openBlueprint(){if(!loaded||loadFailed||saving)return;libraryOptions('blueprint-select',blueprintCatalog(),b=>b.name+' · v'+b.version);libraryOptions('blueprint-device',devices,d=>d.label);message('blueprint-error','');blueprintFields();$('blueprint-dialog').showModal();}
  function applyBlueprint(){
    if(!$('blueprint-dialog').open||saving||!project||!getSession()||$('blueprint-apply').disabled)return;
    try{const bp=blueprintCatalog().find(b=>b.id===$('blueprint-select').value),d=devices.find(d=>d.id===$('blueprint-device').value),items=instantiateBlueprint(bp,d,channels,project.id,$('blueprint-channel').value).map(cleanWidget);if(widgets.length+items.length>maxWidgets)throw new Error('This dashboard supports up to 24 widgets.');if(!editing)startEditing();commit([...widgets,...items]);$('blueprint-dialog').close();message('dashboard-notice','Blueprint added to your draft. Existing widgets and bindings are retained. Save dashboard to sync it.');return refreshData();}catch(e){message('blueprint-error',e.message);}
  }
  function openBlueprintCapture(){if(!loaded||saving||!widgets.length||!getLibrary().ready)return;const used=new Set(widgets.filter(w=>!unbound.includes(w.type)).map(w=>w.device_id));libraryOptions('blueprint-capture-device',devices.filter(d=>used.has(d.id)),d=>d.label,'Notes and headings only');if(used.size===1)$('blueprint-capture-device').value=[...used][0];$('blueprint-capture-name').value='';message('blueprint-capture-error','');$('blueprint-capture-dialog').showModal();}
  function captureBlueprint(event){event.preventDefault();if(!project||saving||!getSession()||!$('blueprint-capture-dialog').open)return;try{onCaptureBlueprint(captureSensorBlueprint($('blueprint-capture-name').value.trim(),widgets,channels,$('blueprint-capture-device').value),$('blueprint-capture-experiment').checked?$('blueprint-capture-device').value:null);$('blueprint-capture-dialog').close();$('blueprint-capture-name').value='';message('dashboard-notice','Blueprint added to your project library draft. Open Templates & groups and Save library to keep it.');}catch(e){message('blueprint-capture-error',e.message);}}
  function reset(){widgetRoots.clear();libraryCategory='All';librarySignature='';for(const id of ['widget-library-search','widget-type-search'])$(id).value='';$('widget-type-category').value='All';
    deactivate();media.reset();$('dashboard-viewer-section').value='';refreshing=false;$('dashboard-auto-refresh').checked=autoPreferred;version++;dataVersion++;project=null;devices=[];channels=[];widgets=[];savedWidgets=[];history=[];layoutExtras={};savedExtras={};dashboardTheme=savedTheme='site';datasets=new Map();revision=0;loaded=false;loadFailed=false;editing=false;dirty=false;saving=false;editId=null;dragId=null;pendingSave=null;
    for(const id of ['blueprint-dialog','blueprint-capture-dialog'])if($(id).open)$(id).close();
    for(const id of ['dashboard-viewer-group','dashboard-viewer-device','blueprint-select','blueprint-device','blueprint-channel','blueprint-capture-device','blueprint-plan'])$(id).replaceChildren();
    $('dashboard-project-scope').textContent='';$('blueprint-capture-name').value='';$('blueprint-summary').textContent='';for(const id of ['blueprint-error','blueprint-capture-error'])message(id,'');$('dashboard-filter-summary').textContent='Each widget keeps its own saved stream binding.';show('dashboard-filter-empty',false);$('dashboard-canvas').classList.toggle('phone-preview',false);$('dashboard-phone-preview').setAttribute('aria-pressed','false');$('dashboard-phone-width').value='390';$('dashboard-phone-scale').value='1';show('dashboard-phone-controls',false);$('dashboard-phone-summary').textContent='';$('dashboard-phone-studio').hidden=false;$('dashboard-canvas').classList.toggle('phone-layout-canvas',false);$('dashboard-canvas-viewport').classList.toggle('phone-preview-viewport',false);
    $('dashboard-canvas').replaceChildren();message('dashboard-error','');message('dashboard-notice','');
    $('dashboard-setup-check').textContent='5';$('dashboard-setup-check').classList.toggle('pending',true);$('dashboard-setup-text').textContent='Add widgets to your project dashboard and save the layout.';
    if($('widget-dialog').open)$('widget-dialog').close();syncControls();
  }
  function syncControls(){
    show('dashboard-edit-toolbar',editing);show('widget-palette-panel',editing);$('dashboard-canvas').classList.toggle('editing-canvas',editing);show('dashboard-edit',!editing);
    $('dashboard-edit').disabled=!loaded||loadFailed||saving;$('dashboard-refresh').disabled=phonePreview()||refreshing;$('dashboard-phone-preview').disabled=!loaded||loadFailed||saving;$('dashboard-phone-studio').hidden=editing;
    $('dashboard-add').disabled=saving||widgets.length>=maxWidgets;
    $('dashboard-first-widget').disabled=!loaded||loadFailed||saving;
    $('dashboard-save').disabled=!dirty||saving||loadFailed;
    $('dashboard-save').textContent=saving?'Saving…':'Save dashboard';
    $('dashboard-undo').disabled=!history.length||saving;
    $('dashboard-discard').disabled=saving;
    $('dashboard-reload').disabled=dirty||saving;
    $('dashboard-range').disabled=saving||phonePreview();$('dashboard-theme').disabled=saving||!loaded||loadFailed;$('dashboard-theme').value=dashboardTheme;
    $('widget-apply').disabled=saving;$('dashboard-blueprint-add').disabled=!loaded||loadFailed||saving||widgets.length>=maxWidgets;$('dashboard-blueprint-capture').disabled=!loaded||loadFailed||saving||!widgets.length||!getLibrary().ready;
    $('dashboard-save-state').textContent=saving?'Saving to Supabase…':dirty?'Unsaved changes':revision?'Saved in Supabase':'No saved layout yet';
    $('dashboard-save-state').classList.toggle('unsaved',dirty);
    $('dashboard-setup-check').textContent=revision&&savedWidgets.length?'✓':'5';$('dashboard-setup-check').classList.toggle('pending',!(revision&&savedWidgets.length));
    $('dashboard-setup-text').textContent=revision&&savedWidgets.length?'Your dashboard layout is saved in Supabase.':'Add widgets to your project dashboard and save the layout.';
  }
  function render(){
    renderLibrary();
    if(gestures.isActive()||phoneGestures.isActive()){syncControls();return;}
    updateViewerOptions();let tabbar=document.getElementById('dashboard-real-tabs');if(!tabbar){tabbar=document.createElement('div');tabbar.id='dashboard-real-tabs';$('dashboard-canvas-viewport').parentElement.insertBefore(tabbar,$('dashboard-canvas-viewport'));}tabbar.replaceChildren(navigationBar(phoneConfig(),$('dashboard-viewer-section').value,key=>{$('dashboard-viewer-section').value=key;render();refreshData();}));
    const preview=phonePreview(),canvas=$('dashboard-canvas'),shown=visibleWidgets(),visible=new Set(shown.map(w=>w.id)),ordered=[],placements=new Map(preview?phoneLayout(phoneConfig(),phoneWidth(),phoneScale(),{visibleIds:visible,showHidden:editing}).map(p=>[p.id,p]):[]);
    canvas.classList.toggle('phone-layout-canvas',preview);$('dashboard-canvas-viewport').classList.toggle('phone-preview-viewport',preview);show('dashboard-phone-controls',preview);
    show('dashboard-phone-editor',preview&&editing);if(preview&&editing)mountPhoneLayoutEditor($('dashboard-phone-editor'),phoneConfig(),{disabled:saving,onChange:changePhone,onEdit:w=>editWidget(w.id)});
    if(preview){canvas.style.setProperty('--phone-width',phoneWidth()+'px');canvas.style.setProperty('--text-scale',String(phoneScale()));$('dashboard-phone-summary').textContent=phoneWidth()+' dp · '+shown.length+' visible · '+(layoutExtras.custom_phone_layout===true?'Custom phone layout':'Shared layout')+(layoutExtras.custom_phone_layout===true?' · '+widgets.filter(w=>w.phone?.visible===false).length+' hidden on phone':'');}
    applySurfaceTheme(canvas,dashboardTheme);media.sync(preview?[]:shown);show('dashboard-empty',widgets.length===0);show('dashboard-filter-empty',widgets.length>0&&shown.length===0);$('dashboard-filter-empty').textContent=preview?'No cards are visible in this phone preview. Check phone visibility or clear temporary filters.':'No saved widgets match these filters. Clear filters to see the whole dashboard.';
    for(const w of shown){
      const i=widgets.findIndex(item=>item.id===w.id),placement=placements.get(w.id);
      const sig=JSON.stringify([w,i,editing,dashboardTheme,preview,preview?phoneWidth():0,preview?phoneScale():0,preview?placement:null,layoutExtras.custom_phone_layout===true,widgetSourceRevision(w,channels,devices,project?.id,behaviorRefs(w))]);
      const old=widgetRoots.get(w.id),same=old?.sig===sig;
      if(same&&(preview||unbound.includes(w.type)||CONTROL_TYPES.includes(w.type))){ordered.push(old.element);continue;}
      if(!same)dispose(w.id);
      const fresh=preview?phonePreviewCard(w,placement,{className:'dashboard-widget',theme:dashboardTheme==='site'?websiteColors():dashboardTheme,scale:phoneScale(),channel:channels.find(c=>c.id===w.channel_id)}):renderWidget(w,i);
      if(preview&&editing&&!same)phoneCardTools(fresh,w,placement);
      const stamp=Number(fresh.getAttribute?.('data-recorded-ms'))||0;
      if(same){
        patchWidgetReadingTree(old.element,fresh,document.activeElement);
        if(!editing&&sampleAdvanced(old.newest,stamp))animateWidget(old.element,widgetIconId(w));
        old.newest=Math.max(old.newest||0,stamp);
        ordered.push(old.element);
      }else{widgetRoots.set(w.id,{sig,element:fresh,newest:stamp});ordered.push(fresh);}
    }
    for(const [id,item] of widgetRoots)if(!visible.has(id)){dispose(id);item.element.remove();widgetRoots.delete(id);}placePanelNodes(canvas,shown,ordered);
    $('dashboard-filter-summary').textContent=visible.size+' of '+widgets.length+' widgets shown · '+(preview?'Phone order, size and visibility applied. ':'')+'Temporary filters are local to this browser.';
    syncControls();
  }
  function commit(next,nextTheme=dashboardTheme,nextExtras=layoutExtras){
    if(saving||!editing)return;const retainedIds=new Set(next.map(w=>w.id));next=next.map(w=>w.type==='panel'&&w.behavior?.version===1?{...w,behavior:{...w.behavior,children:(w.behavior.children||[]).filter(id=>retainedIds.has(id))}}:w);validateDashboardBehavior({...phoneConfig(),widgets:next},channels);
    history.push({widgets:clone(widgets),theme:dashboardTheme,extras:clone(layoutExtras)});if(history.length>30)history.shift();widgets=next;dashboardTheme=nextTheme;layoutExtras=clone(nextExtras);
    dirty=layoutSignature()!==layoutSignature(savedWidgets,savedTheme,savedExtras);message('dashboard-notice','');render();
  }
  function changePhone(id,change){if(!editing||saving)return;try{const next=editPhoneLayout(phoneConfig(),id,change);commit(next.widgets,dashboardTheme,Object.fromEntries(Object.entries(next).filter(([k])=>!['widgets','theme','kind','save_token'].includes(k))));}catch(e){message('dashboard-error',e.message);}}
  function openPhoneEditor(){if(!loaded||loadFailed||saving)return;startEditing();gestures.cancel();phoneGestures.cancel();media.stopAll();controlClient.stop();$('dashboard-phone-preview').setAttribute('aria-pressed','true');render();$('dashboard-phone-editor').scrollIntoView({block:'nearest'});}
  function phoneCardTools(card,w,placement){const tools=document.createElement('div');tools.className='phone-card-tools';const ordered=phoneOrder(phoneConfig()),at=ordered.findIndex(x=>x.id===w.id);for(const [label,fn,disabled]of [['↑',()=>changePhone(w.id,{before:ordered[at-1]?.id}),at===0],['↓',()=>changePhone(w.id,{before:ordered[at+2]?.id||null}),at===ordered.length-1],['Edit',()=>editWidget(w.id),false]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=saving||disabled;b.setAttribute('aria-label',(label==='↑'?'Move up':label==='↓'?'Move down':label)+' '+w.title);b.addEventListener('click',fn);tools.append(b);}const grip=document.createElement('button');grip.type='button';grip.textContent='↕';grip.setAttribute('aria-label','Drag '+w.title);grip.style.touchAction='none';grip.addEventListener('pointerdown',e=>phoneGestures.beginMove(e,w.id,w.title));tools.append(grip);const resize=document.createElement('button');resize.type='button';resize.textContent='↘';resize.setAttribute('aria-label','Resize '+w.title);resize.style.touchAction='none';resize.addEventListener('pointerdown',e=>phoneGestures.beginResize(e,w.id,card,{columns:placement?.span||6,height:placement?.height||0}));resize.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowUp'||e.key==='ArrowDown')changePhone(w.id,{height:Math.max(160,Math.min(960,(placement?.height||240)+(e.key==='ArrowUp'?-20:20)))});else{const spans=[4,6,12],index=spans.indexOf(placement?.span||6);changePhone(w.id,{span:spans[Math.max(0,Math.min(2,index+(e.key==='ArrowLeft'?-1:1)))]});}});tools.append(resize);if(layoutExtras.custom_phone_layout&&w.phone?.visible===false){const hidden=document.createElement('span');hidden.textContent='Hidden on phone';tools.append(hidden);}card.append(tools);}
  function bind(w){
    const device=devices.find(d=>d.id===w.device_id&&d.project_id===project?.id);
    const channel=channels.find(c=>c.id===w.channel_id&&c.device_id===device?.id&&accepts(w.type,c));
    return device&&channel?{device,channel}:null;
  }
  function validReadings(data){return validStreamReadings(data?.rows||[],'number');}
  function summarize(data){
    const valid=validReadings(data);if(!valid.length)return null;
    const values=valid.map(r=>r.value_num),min=Math.min(...values),max=Math.max(...values);
    // Divide before summing so large finite values do not overflow an ordinary sum.
    const mean=values.reduce((total,n)=>total+n/values.length,0);
    return {valid,latest:values.at(-1),mean,min,max};
  }
  function number(value,channel,w){return widgetNumber(value,channel,w);}
  function time(value){const date=new Date(value);return Number.isNaN(date.getTime())?'Time unavailable':date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
  function svg(name,attrs={},text){const el=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;}
  function widgetIcon(type){const icon=svg('svg',{viewBox:'0 0 24 24',class:'widget-icon','aria-hidden':'true'});icon.append(svg('path',{d:WIDGET_DESIGN.icons[type]||WIDGET_DESIGN.icons.value}));return icon;}
  function websiteColors(){const id=document.documentElement.getAttribute('data-theme');return THEME_IDS.includes(id)?id:'mint';}
  function makeGauge(w,value,unit,channel){
    const p=Math.max(0,Math.min(1,(value-w.min)/(w.max-w.min)));
    const plot=svg('svg',{viewBox:'0 0 240 157',class:'widget-gauge',role:'img','aria-label':`${w.title}: ${number(value,channel,w)} ${unit}. Gauge range ${w.min} to ${w.max}.`});
    const d='M 25 114 A 95 95 0 0 1 215 114';
    plot.append(svg('path',{d,fill:'none',stroke:'#e9f2ed','stroke-width':13,'stroke-linecap':'round'}));
    plot.append(svg('path',{d,fill:'none',stroke:'#168c77','stroke-width':13,'stroke-linecap':'round',pathLength:100,'stroke-dasharray':`${p*100} 100`}));
    const reading=svg('text',{x:120,y:95,'text-anchor':'middle',class:'widget-gauge-value'},number(value,channel,w));const typography=widgetTextPlan(w,'value',29);if(typography.enabled)reading.style.fontSize=gaugeTextSize(w,number(value,channel,w))+'px';plot.append(reading);
    plot.append(svg('text',{x:120,y:113,'text-anchor':'middle',class:'widget-gauge-unit'},unit));
    plot.append(svg('text',{x:23,y:141,class:'widget-gauge-label'},number(w.min,channel,w)));
    plot.append(svg('text',{x:217,y:141,'text-anchor':'end',class:'widget-gauge-label'},number(w.max,channel,w)));return plot;
  }
  function makeChart(w,data,summary,unit){
    const valid=summary.valid,lo=summary.min,hi=summary.max;
    // Normalize first to keep SVG coordinates finite even for extreme readings.
    const scale=Math.max(1,Math.abs(lo),Math.abs(hi)),low=lo/scale,high=hi/scale;
    const pad=low===high?.1:(high-low)*.12,lower=low-pad,upper=high+pad;
    const first=Date.parse(valid[0].recorded_at),last=Date.parse(valid.at(-1).recorded_at);
    const x=ts=>last===first?260:40+(ts-first)/(last-first)*462;
    const y=n=>15+(upper-n/scale)/(upper-lower)*136;
    const plot=svg('svg',{viewBox:'0 0 520 185',class:'sensor-chart',role:'img','aria-label':`${w.title}: ${valid.length} saved samples in ${unit||'stream units'}. Lines connect saved samples; invalid readings leave gaps.`});
    for(let i=0;i<4;i++){const normalized=lower+(upper-lower)*i/3,n=normalized*scale,pos=15+(upper-normalized)/(upper-lower)*136;plot.append(svg('line',{x1:40,x2:502,y1:pos,y2:pos,stroke:'#e8efed','stroke-width':1}));plot.append(svg('text',{x:0,y:pos+3,class:'chart-time'},number(n,channels.find(c=>c.id===w.channel_id),w)));}
    let path='',pen=false;
    for(const row of data.rows){if(!valid.includes(row)){pen=false;continue;}path+=(pen?' L':' M')+x(Date.parse(row.recorded_at)).toFixed(2)+' '+y(row.value_num).toFixed(2);pen=true;}
    plot.append(svg('path',{d:path,fill:'none',stroke:'#007f79','stroke-width':2.3,'stroke-linejoin':'round'}));
    for(const row of valid)plot.append(svg('circle',{cx:x(Date.parse(row.recorded_at)),cy:y(row.value_num),r:2.3,fill:'#007f79'}));
    const label=t=>new Date(t).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
    plot.append(svg('text',{x:40,y:177,class:'chart-time'},label(first)));plot.append(svg('text',{x:502,y:177,'text-anchor':'end',class:'chart-time'},label(last)));return plot;
  }
  function renderWidget(w,index){
    const card=document.createElement('article');card.className='dashboard-widget'+(w.width==='full'?' full-width':'')+(editing?' editable':'');card.setAttribute('data-widget-id',w.id);applySurfaceTheme(card,w.theme);
    const dimensions=w.size||{columns:w.width==='full'?12:6,height:0};card.style.setProperty('--widget-cols',String(dimensions.columns));if(dimensions.height){card.style.setProperty('--widget-height',dimensions.height+'px');card.classList.toggle('sized-widget',true);}
    card.style.setProperty('--phone-cols',String(phoneColumns(w,window.innerWidth||390,1,layoutExtras.custom_phone_layout===true)));applyWidgetAppearance(card,w,dashboardTheme==='site'?websiteColors():dashboardTheme);if(w.design?.align&&['left','center','right'].includes(w.design.align))card.style.textAlign=w.design.align;const head=document.createElement('div');head.className='dashboard-widget-heading';const title=document.createElement('h3');const defaultControlTitle=(w.type==='switch'&&w.title==='Button / switch · On/Off')||(w.type==='rgb'&&w.title==='RGB color');title.textContent=defaultControlTitle?(bind(w)?.channel.title||w.title):w.title;decorateWidgetText(title,w,'title');const tag=document.createElement('span');tag.className='widget-type-tag';tag.textContent=typeLabels[w.type];head.append(title,widgetIcon(widgetIconId(w)),tag);
    const vpin=bind(w)?.channel.config?.virtual_pin;
    if(typeof vpin==='string'&&/^V[0-9]{1,3}$/i.test(vpin)){
      const pin=document.createElement('span');pin.className='widget-pin';pin.textContent=vpin.toUpperCase();head.append(pin);
    }
    card.append(head);
    if(w.type==='note'){const p=document.createElement('p');p.className='widget-note-copy';p.textContent=w.note;decorateWidgetText(p,w);card.append(p);}
    else if(w.type==='panel'){const group=document.createElement('div');group.className='dashboard-panel-grid';group.setAttribute('data-panel-grid','');group.setAttribute('role','group');group.setAttribute('aria-label',w.title);card.append(group);}
    else if(w.type==='heading'){const p=document.createElement('h2');p.className='widget-section-heading';if(widgetTextPlan(w,'title').enabled){const title=document.createElement('span');title.textContent=w.title;title.style.flex='1';decorateWidgetText(title,w,'title');p.append(title);}else p.textContent=w.title;p.append(widgetIcon(widgetIconId(w)));head.hidden=true;card.append(p);}
    else if(w.type==='divider'){const line=document.createElement('hr');line.className='widget-divider';card.append(line);}
    else if(w.type==='camera'&&w.mode==='protected')card.append(protectedMedia(w,{request,getSession,canUse:()=>active&&!!getSession()&&navigator.onLine!==false,onDispose:f=>{if(!disposers.has(w.id))disposers.set(w.id,[]);disposers.get(w.id).push(f);}}));
    else if(w.type==='camera')card.append(media.render(w));
    else{
      const binding=bind(w),data=datasets.get(w.channel_id),valid=validStreamReadings(data?.rows||[],binding?.channel.value_type||'number'),summary=binding?.channel.value_type==='number'?summarize(data):null;
      if(binding?.device.config?.mode==='hardware'&&binding.channel.direction==='input'){
        const now=Date.now();
        for(let n=valid.length-1;n>=0;n--){const stamp=Date.parse(valid[n].recorded_at);if(stamp<=now+2000){card.setAttribute('data-recorded-ms',String(stamp));break;}}
      }
      if(!binding){const p=document.createElement('p');p.className='widget-error-state';p.textContent='Stream unavailable. Check its binding in Edit.';card.append(p);}
      else if(CONTROL_TYPES.includes(w.type)){if(!editing)card.append(renderOutputControl(w,{...binding,channels,readings:id=>datasets.get(id)?.rows||[],request,isOwner:()=>!!getSession(),statusSource:controlStatus,canUse:()=>!!getSession()&&navigator.onLine!==false,active:()=>active,client:controlClient,onDispose:f=>{if(!disposers.has(w.id))disposers.set(w.id,[]);disposers.get(w.id).push(f);}}));else{const p=document.createElement('p');p.textContent='Output controls are disabled while editing.';card.append(p);}}
      else if(SPECIAL_TYPES.includes(w.type))card.append(renderSpecial(w,binding.channel,data,(w.series||[]).map(id=>({channel:channels.find(c=>c.id===id),rows:datasets.get(id)?.rows})).filter(s=>s.channel)));
      else if(data?.error&&!valid.length){const p=document.createElement('p');p.className='widget-error-state';p.textContent=data.error;card.append(p);}
      else if(!valid.length){const p=document.createElement('p');p.className='widget-no-data';p.textContent=data?(binding.device.config?.mode==='simulation'?'No simulated readings in this time range.':'No sensor readings in this time range.'):'Loading saved readings…';card.append(p);}
      else if(w.type==='value'){
        const value=document.createElement('div');value.className='widget-reading';value.textContent=number(summary[w.aggregation],binding.channel,w);const unit=document.createElement('small');unit.textContent=binding.channel.unit;if(widgetTextPlan(w).enabled){unit.style.display=widgetTextPlan(w).unitPlacement==='below'?'block':'inline';unit.style.fontSize='15px';unit.style.marginLeft=widgetTextPlan(w).unitPlacement==='below'?'0':'4px';}value.append(unit);decorateWidgetText(value,w,'value',(window.innerWidth||390)>720&&dimensions.columns===12?42:38);card.append(value);
        const label=document.createElement('p');label.className='widget-stat-label';label.textContent={latest:'Latest',mean:'Sample average',min:'Minimum',max:'Maximum'}[w.aggregation];card.append(label);
        const updated=document.createElement('p');updated.className='widget-data-updated';updated.textContent=`${summary.valid.length} valid samples · Latest recorded ${time(summary.valid.at(-1).recorded_at)}`;card.append(updated);
      }else if(w.type==='gauge'){
        card.append(makeGauge(w,summary.latest,binding.channel.unit,binding.channel));
        if(summary.latest<w.min||summary.latest>w.max){const p=document.createElement('p');p.className='widget-out-of-range';p.textContent='Reading is outside the configured gauge range.';card.append(p);}
      }else if(w.type==='chart'){
        card.append(makeChart(w,data,summary,binding.channel.unit));const p=document.createElement('p');p.className='widget-chart-count';p.textContent=`Latest ${data.rows.length} stored readings · ${summary.valid.length} valid · ${binding.channel.unit||'Stream units'}`;card.append(p);
      }
      else if(w.type==='text'){
        const text=document.createElement('p');text.className='widget-text-reading';decorateWidgetText(text,w);text.textContent=String(valid.at(-1).value_text).slice(0,2000);card.append(text);
      }else if(['status','led'].includes(w.type)){
        const on=valid.at(-1).value_bool,label=document.createElement('div');label.className='widget-status'+(on?' is-on':'');
        if(w.type==='led'){const light=document.createElement('span');light.className='widget-led';light.setAttribute('aria-hidden','true');label.append(light);}
        const text=document.createElement('span');text.textContent=on?w.on_label:w.off_label;decorateWidgetText(text,w);if(widgetTextPlan(w).enabled){label.style.width="100%";label.style.boxSizing="border-box";text.style.flex="1";}label.append(text);card.append(label);
      }else if(w.type==='progress'){
        const value=summary.latest,bar=document.createElement('progress');bar.max=1;bar.value=Math.max(0,Math.min(1,(value-w.min)/(w.max-w.min)));bar.setAttribute('aria-label',w.title+' · '+number(value,binding.channel,w)+' '+(binding.channel.unit||''));bar.className='widget-progress';
        const label=document.createElement('p');label.className='widget-progress-value';decorateWidgetText(label,w);label.textContent=number(value,binding.channel,w)+' '+binding.channel.unit+' · Range '+number(w.min,binding.channel,w)+'–'+number(w.max,binding.channel,w)+(value<w.min||value>w.max?' · Outside display range':'');card.append(bar,label);
      }else if(w.type==='table'){
        const table=document.createElement('table');table.className='stream-history-table';const caption=document.createElement('caption');caption.textContent='Latest 10 valid saved samples';table.append(caption);const thead=document.createElement('thead'),tr=document.createElement('tr');
        for(const text of ['Recorded','Value','Quality']){const th=document.createElement('th');th.textContent=text;th.scope='col';tr.append(th);}thead.append(tr);table.append(thead);const tbody=document.createElement('tbody');
        for(const row of valid.slice(-10).reverse()){const line=document.createElement('tr'),type=binding.channel.value_type,value=streamValue(row,type);for(const text of [time(row.recorded_at),type==='boolean'?(value?'On':'Off'):type==='number'?number(value,binding.channel,w)+(binding.channel.unit?' '+binding.channel.unit:''):String(value).slice(0,2000),row.quality]){const cell=document.createElement('td');cell.textContent=text;line.append(cell);}tbody.append(line);}table.append(tbody);const wrap=document.createElement('div');wrap.className='widget-table-scroll';wrap.append(table);card.append(wrap);
      }
      if(binding&&valid.length&&['text','status','led','progress','gauge','chart','table'].includes(w.type)){const p=document.createElement('p');p.className='widget-data-updated';p.textContent='Saved data · Latest recorded '+time(valid.at(-1).recorded_at)+' · '+valid.at(-1).quality;card.append(p);}
      if(binding){const footer=document.createElement('div');footer.className='widget-binding';const label=document.createElement('span');label.textContent=binding.device.label+' / '+binding.channel.title+(pinSummary(binding.channel)?' · '+pinSummary(binding.channel):'');footer.append(label);if(binding.device.config?.mode==='simulation'){const badge=document.createElement('span');badge.className='sim-badge';badge.textContent='SIMULATED';footer.append(badge);}card.append(footer);}
    }
    if(editing){
      const tools=document.createElement('div');tools.className='widget-tools';
      const button=(label,aria,action,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',aria);b.disabled=disabled||saving;b.addEventListener('click',action);tools.append(b);return b;};
      button('↑','Move '+w.title+' earlier',()=>move(w.id,index-1),index===0);button('↓','Move '+w.title+' later',()=>move(w.id,index+1),index===widgets.length-1);
      button('Edit','Edit '+w.title,()=>editWidget(w.id));button('Copy','Duplicate '+w.title,()=>{if(widgets.length>=maxWidgets)return;commit([...widgets,{...clone(w),id:crypto.randomUUID(),title:(w.title+' copy').slice(0,120)}]);},widgets.length>=maxWidgets);
      button('Remove','Remove '+w.title,()=>commit(widgets.filter(row=>row.id!==w.id))).className='widget-remove';card.append(tools);
      head.hidden=false;const grip=document.createElement('button');grip.type='button';grip.className='widget-drag-handle';grip.textContent='⠿';grip.setAttribute('aria-label','Drag '+w.title+' to move. Use the move buttons for keyboard reordering.');grip.disabled=saving;grip.addEventListener('pointerdown',event=>gestures.beginMove(event,w.id,w.title));head.append(grip);
      const resize=document.createElement('button');resize.type='button';resize.className='widget-resize-handle';resize.textContent='◢';resize.disabled=saving;resize.setAttribute('aria-label','Resize '+w.title+'. Arrow left or right adjusts width; up or down adjusts height.');resize.addEventListener('pointerdown',event=>gestures.beginResize(event,w.id,card,dimensions));
      resize.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)||saving)return;event.preventDefault();const current=w.size||{columns:w.width==='full'?12:6,height:0};if(event.key==='Home'){resizeWidget(w.id,{columns:6,height:0});return;}const columns=Math.max(3,Math.min(12,current.columns+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0))),height=['ArrowUp','ArrowDown'].includes(event.key)?Math.max(160,Math.min(960,(current.height||Math.round(card.getBoundingClientRect().height/20)*20)+(event.key==='ArrowDown'?20:-20))):current.height;resizeWidget(w.id,{columns,height});});
      // Keep editing tools last in the card for a predictable keyboard order.
      card.removeChild(tools);card.append(resize,tools);
    }
    return card;
  }
  function resizeWidget(id,size){if(!editing||saving||!widgets.some(w=>w.id===id))return;const clean=normalizeWidgetSize(size);commit(widgets.map(w=>w.id===id?{...w,size:clean,width:clean.columns===12?'full':'half'}:w));$('dashboard-layout-status').textContent='Widget resized to '+clean.columns+' of 12 columns'+(clean.height?', '+clean.height+' pixels high.':', automatic height.');const card=[...$('dashboard-canvas').children].find(c=>c.getAttribute('data-widget-id')===id);card?.querySelector?.('.widget-resize-handle')?.focus();}
  function move(id,to){to=Math.max(0,Math.min(widgets.length-1,to));const from=widgets.findIndex(w=>w.id===id);if(from<0||to<0||to>=widgets.length||from===to)return;const next=clone(widgets),[item]=next.splice(from,1);next.splice(to,0,item);commit(next);}
  async function readRecord(){return rows(await request('/rest/v1/widgets?select=id,project_id,widget_type,title,config,revision&id=eq.'+encodeURIComponent(project.id)+'&project_id=eq.'+encodeURIComponent(project.id),{authenticated:true}))[0]||null;}
  async function loadLayout(){
    const ctx=context();show('dashboard-loading');
    try{
      const parsed=parseRecord(await readRecord());if(!current(ctx))return;
      layoutExtras=clone(parsed.extras);savedExtras=clone(parsed.extras);widgets=clone(parsed.widgets);savedWidgets=clone(parsed.widgets);dashboardTheme=savedTheme=parsed.theme;revision=parsed.revision;history=[];dirty=false;loaded=true;loadFailed=false;pendingSave=null;render();
    }catch(err){if(current(ctx)){loaded=false;loadFailed=true;message('dashboard-error',dashboardError(err,'Couldn’t load the saved dashboard. Use Reload saved layout to retry.'));syncControls();}}
    finally{if(current(ctx))show('dashboard-loading',false);}
  }
  async function loadCatalog(){
    const ctx=context(),all=[];
    for(let i=0;i<devices.length;i+=40){
      const ids=devices.slice(i,i+40).map(d=>d.id).filter(id=>uuidPattern.test(id));if(!ids.length)continue;
      const data=rows(await request('/rest/v1/channels?select=id,device_id,channel_key,title,unit,value_type,direction,config&device_id=in.('+ids.join(',')+')&order=title.asc&limit=1000',{authenticated:true}));
      if(!current(ctx))return;all.push(...data);
    }
    if(current(ctx))channels=all.filter(c=>['number','boolean','text'].includes(c.value_type)&&devices.some(d=>d.id===c.device_id));
  }
  async function open(nextProject,nextDevices){
    if(project?.id!==nextProject.id){reset();project=nextProject;}
    active=true;devices=nextDevices.filter(d=>d.project_id===project.id);const ctx=context();
    message('dashboard-error','');
    const work=[loadCatalog()];if(!loaded)work.push(loadLayout());
    const results=await Promise.allSettled(work);if(!current(ctx))return;
    for(const r of results)if(r.status==='rejected')message('dashboard-error',dashboardError(r.reason,'Couldn’t load sensor sources. Return to this tab to retry.'));
    render();await refreshData();queueAuto();queueLayoutSync();
  }
  async function refreshData(){
    if(!project||!getSession())return;const ctx=context(),requestVersion=++dataVersion;
    const reportWidgets=phonePreview()?[]:visibleWidgets().filter(w=>['health','alarm'].includes(w.type)&&w.behavior?.version===1&&['device','events'].includes(w.behavior.variant));
    const needed=phonePreview()?[]:[...new Set(visibleWidgets().filter(w=>!unbound.includes(w.type)&&bind(w)).flatMap(behaviorRefs))];
    refreshing=true;$('dashboard-refresh').disabled=true;
    const hours=Number($('dashboard-range').value)||24,since=new Date(Date.now()-hours*3600000).toISOString();
    const result=await Promise.allSettled(needed.map(async id=>{
      try{
        const data=rows(await request('/rest/v1/telemetry?select=id,channel_id,value_num,value_bool,value_text,recorded_at,received_at,quality&channel_id=eq.'+encodeURIComponent(id)+'&recorded_at=gte.'+encodeURIComponent(since)+'&order=recorded_at.desc,id.desc&limit=100',{authenticated:true}));
        if(current(ctx)&&requestVersion===dataVersion)datasets.set(id,{rows:data.slice().reverse()});
      }catch(err){if(current(ctx)&&requestVersion===dataVersion)datasets.set(id,{...datasets.get(id),rows:datasets.get(id)?.rows||[],error:friendlyError(err,'Couldn’t load readings. Use Refresh data to retry.')});}
    }));
    await Promise.allSettled(reportWidgets.map(async w=>{try{let health,events;if(w.type==='health')health=safeDeviceHealth(await request('/rest/v1/rpc/rs_io_device_status',{method:'POST',authenticated:true,body:{p_device:w.device_id}}));else events=rows(await request('/rest/v1/events?select=id,device_id,event_type,severity,title,occurred_at,acknowledged_at&device_id=eq.'+encodeURIComponent(w.device_id)+'&order=occurred_at.desc,id.desc&limit=50',{authenticated:true}));if(current(ctx)&&requestVersion===dataVersion){const data=datasets.get(w.channel_id)||{rows:[]};if(health)data.device_health=health;if(events)data.events=events;datasets.set(w.channel_id,data);}}catch{if(current(ctx)&&requestVersion===dataVersion){const data=datasets.get(w.channel_id)||{rows:[]};data.report_error='Report unavailable; last confirmed data only';datasets.set(w.channel_id,data);}}}));
    if(!current(ctx)||requestVersion!==dataVersion)return;
    // Each channel handles its own error; inspect unexpected failures as well.
    for(const r of result)if(r.status==='rejected')message('dashboard-error','Some readings could not be loaded. Try Refresh data.');
    refreshing=false;$('dashboard-refresh').disabled=false;
    const hardwareIds=needed.filter(id=>{
      const ch=channels.find(c=>c.id===id),d=ch&&devices.find(device=>device.id===ch.device_id);
      return ch?.direction==='input'&&d?.config?.mode==='hardware';
    });
    const freshness=readingFreshness(hardwareIds.flatMap(id=>{
      const type=channels.find(c=>c.id===id).value_type;
      return validStreamReadings(datasets.get(id)?.rows||[],type);
    }));
    const failed=needed.some(id=>datasets.get(id)?.error);
    const label=phonePreview()?'Phone preview · example data':hardwareIds.length?sampleStatus(freshness):needed.length?'Saved dashboard':'';
    $('dashboard-data-state').setAttribute('data-age',failed||hardwareIds.length&&!freshness.live&&!phonePreview()?'waiting':'normal');
    $('dashboard-data-state').textContent=[label,failed?'Refresh failed':!$('dashboard-auto-refresh').checked?'Auto refresh paused':''].filter(Boolean).join(' · ');
    render();
  }
  function queueLayoutSync(){
    clearTimeout(syncTimer);const cycle=++syncVersion;if(!active||!loaded||loadFailed||!getSession()||document.hidden)return;
    syncTimer=setTimeout(async()=>{if(cycle!==syncVersion||!active)return;
      try{const ctx=context(),remote=parseRecord(await readRecord());if(!current(ctx)||cycle!==syncVersion)return;
        if(remote.revision>revision){
          if(dirty||saving||gestures.isActive()||$('widget-dialog').open){$('dashboard-sync-state').textContent='A newer saved layout is available. Finish or discard your draft before reloading.';}
          else{layoutExtras=clone(remote.extras);savedExtras=clone(remote.extras);widgets=clone(remote.widgets);savedWidgets=clone(remote.widgets);dashboardTheme=savedTheme=remote.theme;revision=remote.revision;history=[];pendingSave=null;render();await refreshData();$('dashboard-sync-state').textContent='Layout synced from another device.';}
        }else $('dashboard-sync-state').textContent='Saved layout sync active · Checks every 5 seconds.';
      }catch{if(cycle===syncVersion)$('dashboard-sync-state').textContent='Layout sync needs a connection. Your current view is retained.';}
      if(cycle===syncVersion)queueLayoutSync();
    },5000);
  }
  function startEditing(){if(!loaded||loadFailed||saving)return;$('dashboard-viewer-group').value='';$('dashboard-viewer-device').value='';editing=true;message('dashboard-notice','');render();}
  function sourceOptions(preferredDevice,preferredChannel){
    $('widget-device').replaceChildren();for(const d of devices){const option=document.createElement('option');option.value=d.id;option.textContent=d.label;$('widget-device').append(option);}
    $('widget-device').value=devices.some(d=>d.id===preferredDevice)?preferredDevice:devices.find(d=>channels.some(c=>c.device_id===d.id&&accepts($('widget-type').value,c)))?.id||devices[0]?.id||'';
    streamOptions(preferredChannel);
  }
  function streamOptions(preferred){
    const available=channels.filter(c=>c.device_id===$('widget-device').value&&accepts($('widget-type').value,c));$('widget-channel').replaceChildren();
    for(const ch of available){const option=document.createElement('option');option.value=ch.id;option.textContent=streamMappingLabel(ch,devices);$('widget-channel').append(option);}
    $('widget-channel').value=available.some(c=>c.id===preferred)?preferred:available[0]?.id||'';
    $('widget-channel').disabled=!available.length;
    $('widget-create-control-stream').hidden=!canCreateControl($('widget-type').value);
    const ch=available.find(c=>c.id===$('widget-channel').value);$('widget-source-summary').textContent=ch?streamMappingLabel(ch,devices):'No compatible stream for this device and widget.';$('widget-min').value=String(Number.isFinite(ch?.config?.io?.min??ch?.config?.min)?(ch.config?.io?.min??ch.config.min):0);$('widget-max').value=String(Number.isFinite(ch?.config?.io?.max??ch?.config?.max)?(ch.config?.io?.max??ch.config.max):100);
  }
  function cameraFields(){const mode=$('widget-camera-mode').value;show('widget-camera-facing-field',mode==='webcam');show('widget-camera-url-field',['snapshot','mjpeg','video'].includes(mode));$('widget-camera-url').disabled=$('widget-type').value!=='camera'||!['snapshot','mjpeg','video'].includes(mode);}
  function formFields(){
    const type=$('widget-type').value;let behaviorBox=document.getElementById('widget-behavior-fields');if(!behaviorBox){behaviorBox=document.createElement('fieldset');behaviorBox.id='widget-behavior-fields';$('widget-form').insertBefore(behaviorBox,$('widget-form').lastElementChild);}const behaviorKey=type+'|'+$('widget-channel').value+'|'+(editId||'new');if(behaviorKey!==behaviorFormKey){const old=widgets.find(w=>w.id===editId)||{};readBehavior=mountBehaviorForm(behaviorBox,{...old,type,channel_id:$('widget-channel').value},channels,widgets);behaviorFormKey=behaviorKey;}const range=['gauge','progress','tank'].includes(type);show('widget-source-fields',!unbound.includes(type)||type==='camera'&&$('widget-camera-mode').value==='protected');show('widget-series-field',['multi','bar'].includes(type));show('widget-note-field',type==='note');show('widget-gauge-fields',range);show('widget-aggregation-field',type==='value');show('widget-status-fields',['status','led'].includes(type));show('widget-camera-fields',type==='camera');$('widget-min').disabled=!range;$('widget-max').disabled=!range;cameraFields();
    show('widget-value-text-fields',supportsValueText(type));show('widget-value-align-field',type!=='gauge');show('widget-fit-field',type!=='gauge');show('widget-unit-field',type==='value');
    show('widget-number-fields',NUMERIC_WIDGETS.includes(type)&&channels.find(c=>c.id===$('widget-channel').value)?.value_type==='number');settingsPreview();
    $('widget-source-help').textContent=CONTROL_TYPES.includes(type)?'Choose a writable output stream. Output requests are sent only after an explicit control action; placement and save do not operate hardware.':type==='camera'?'Typed media uses its protected media ID, separately from numeric samples.':'Uses stored readings from the selected time range. Simulated streams stay clearly labeled.';
    $('widget-type-help').textContent={value:'Show the latest number or a statistic from saved samples.',gauge:'A numeric dial with your chosen display range.',chart:'Plot saved numeric readings over time.',progress:'Show a numeric value against a display range. This does not change the sensor value.',text:'Display the latest text message saved by this stream.',status:'Label an on/off stream, such as motion or a door switch.',led:'A colored indicator for an on/off stream. This is a display, not a physical LED control.',table:'Show the latest 10 valid number, on/off, or text readings.',camera:'Choose a protected ESP32-CAM media stream or retained generic/local source. Media starts explicitly.',note:'Add instructions, observations, or a hypothesis.',heading:'Organize the dashboard with a section title.',divider:'Separate groups of widgets with a labeled line.',switch:'This button sends On or Off to the selected LED, relay or compatible Boolean output. Cloud acceptance and board-applied feedback are shown separately.'}[type]||inventory().find(i=>i.type===type)?.reason||'';
  }
  function editWidget(id){
    if(!editing||saving)return;const w=widgets.find(row=>row.id===id);if(!w)return;editId=id;
    $('widget-form').reset();$('widget-dialog-title').textContent='Edit your widget.';$('widget-apply').textContent='Apply changes ↗';$('widget-theme').value=w.theme||'inherit';$('widget-type-search').value='';$('widget-type-category').value='All';typeOptions(w.type);$('widget-type').value=w.type;$('widget-width').value=Object.keys(widthColumns).find(key=>widthColumns[key]===(w.size?.columns||(w.width==='full'?12:6)))||w.width;$('widget-height').value=String(w.size?.height||0);$('widget-title').value=w.title;$('widget-note').value=w.note||'';$('widget-aggregation').value=w.aggregation||'latest';
    $('widget-on-label').value=w.on_label||'On';$('widget-off-label').value=w.off_label||'Off';$('widget-camera-mode').value=w.mode||'webcam';$('widget-camera-facing').value=w.facing||'environment';$('widget-camera-url').value=w.url||'';
    settingsFields(w);sourceOptions(w.device_id,w.channel_id);seriesOptions(w.series||[]);if(['gauge','progress','tank'].includes(w.type)){$('widget-min').value=String(w.min);$('widget-max').value=String(w.max);}formFields();message('widget-error','');$('widget-dialog').showModal();$('widget-title').focus();
  }
  for(const id of ['widget-icon','widget-precision','widget-zeros','widget-aggregation','widget-on-label','widget-off-label','widget-title','widget-theme','widget-min','widget-max',...['title_size','value_size','title_align','value_align','auto_fit','unit_placement'].map(k=>'widget-'+k.replaceAll('_','-'))]){$(id).addEventListener('input',settingsPreview);$(id).addEventListener('change',settingsPreview);}
  function textFormValues(){return Object.fromEntries(['title_size','value_size','title_align','value_align','auto_fit','unit_placement'].map(k=>[k,$('widget-'+k.replaceAll('_','-')).value]));}
  function settingsFields(w){behaviorFormKey='';const values=widgetSettingValues(w),icons=iconChoices();if(values.icon&&!icons.some(([id])=>id===values.icon))icons.push([values.icon,'Saved icon · retained until changed']);$('widget-icon').replaceChildren();for(const [id,label]of icons){const option=document.createElement('option');option.value=id;option.textContent=label;$('widget-icon').append(option);}$('widget-icon').value=values.icon;for(const key of ['title_size','value_size']){const select=$('widget-'+key.replaceAll('_','-'));select.replaceChildren();for(const [v,label]of textSizeChoices(w,key)){const o=document.createElement('option');o.value=v;o.textContent=label;select.append(o);}}for(const key of ['title_size','value_size','title_align','value_align','auto_fit','unit_placement'])$('widget-'+key.replaceAll('_','-')).value=values[key];$('widget-precision').value=values.precision;$('widget-zeros').checked=values.zeros;}
  function settingsPreview(){const old=widgets.find(w=>w.id===editId)||{},w={...clone(old),type:$('widget-type').value,title:$('widget-title').value||'Widget',aggregation:$('widget-aggregation').value,on_label:$('widget-on-label').value,off_label:$('widget-off-label').value,theme:$('widget-theme').value};for(const key of ['min','max']){const n=Number($('widget-'+key).value);if(Number.isFinite(n))w[key]=n;}try{applyWidgetSettings(w,{...textFormValues(),icon:$('widget-icon').value,precision:$('widget-precision').value,zeros:$('widget-zeros').checked},old);$('widget-settings-preview').replaceChildren(renderWidgetScene(w,dashboardTheme==='site'?websiteColors():dashboardTheme,300,1,channels.find(c=>c.id===$('widget-channel').value)));}catch(error){$('widget-settings-preview').textContent=error.message;}}
  function newWidget(type='value',position=null){
    const fromPalette=typeof type==='string'&&types.includes(type);if(!fromPalette)type='value';insertAt=Number.isInteger(position)?position:null;
    if(!loaded||loadFailed||saving)return;if(widgets.length>=maxWidgets){message('dashboard-error','This dashboard can hold up to 24 widgets.');return;}
    if(!editing)startEditing();editId=null;const item=inventory().find(i=>i.type===type);if(fromPalette&&!item?.enabled){if(canCreateControl(type)){addControlStream(type).catch(e=>message('dashboard-error',e.message));return;}message('dashboard-notice',item?.reason||'This widget is unavailable.');return;}if(!item?.enabled)type=inventory().find(i=>i.enabled)?.type||'note';$('widget-form').reset();$('widget-type-search').value='';$('widget-type-category').value='All';typeOptions(type);$('widget-dialog-title').textContent='Add a widget.';$('widget-apply').textContent='Add to dashboard ↗';$('widget-theme').value='inherit';$('widget-type').value=type;$('widget-width').value=['panel','chart','table','heading','divider','camera','multi','bar','timeline','heatmap','vector','gps'].includes(type)?'full':'half';$('widget-height').value='0';$('widget-title').value=fromPalette?(inventory().find(i=>i.type===type)?.label||type):'';$('widget-note').value='';$('widget-aggregation').value='latest';$('widget-on-label').value='On';$('widget-off-label').value='Off';$('widget-camera-mode').value='webcam';$('widget-camera-facing').value='environment';$('widget-camera-url').value='';settingsFields({type});sourceOptions();seriesOptions([]);formFields();message('widget-error','');$('widget-dialog').showModal();$('widget-title').focus();
  }
  async function applyWidget(event){
    event.preventDefault();if(!editing||saving)return;
    const type=$('widget-type').value,title=$('widget-title').value.trim(),width=$('widget-width').value==='full'?'full':'half';
    if(!types.includes(type)||!title||title.length>120){message('widget-error','Choose a widget type and a title of 1–120 characters.');return;}
    const original=widgets.find(w=>w.id===editId),choice=inventory().find(i=>i.type===type);if(!choice?.enabled&&original?.type!==type){message('widget-error',choice?.reason||'This widget is unavailable.');return;}let next={...clone(original||{}),id:editId||crypto.randomUUID(),type,title,width,theme:$('widget-theme').value,size:{...clone(original?.size||{}),columns:widthColumns[$('widget-width').value]||6,height:$('widget-height').value.trim()===''?0:Number($('widget-height').value)}};
    if(unbound.includes(type)&&!(type==='camera'&&next.mode==='protected')){for(const k of ['device_id','channel_id','media_id','series'])delete next[k];}
    if(type==='note'){const note=$('widget-note').value.trim();if(!note||note.length>1000){message('widget-error','Write a note of 1–1,000 characters.');return;}next.note=note;}
    else if(type==='camera'){next.mode=$('widget-camera-mode').value;if(next.mode==='protected'){const c=channels.find(c=>c.id===$('widget-channel').value&&c.device_id===$('widget-device').value&&accepts('camera',c));if(!c){message('widget-error','Choose a compatible owned media stream.');return;}next.device_id=c.device_id;next.channel_id=c.id;next.media_id=c.config.io.media_id;delete next.url;delete next.facing;}else{next.facing=$('widget-camera-facing').value;next.url=$('widget-camera-url').value;for(const k of ['device_id','channel_id','media_id','series'])delete next[k];}}
    else if(!unbound.includes(type)){
      const d=devices.find(row=>row.id===$('widget-device').value),c=channels.find(row=>row.id===$('widget-channel').value&&row.device_id===d?.id);
      if(!d||!c||!accepts(type,c)){message('widget-error',['value','gauge','chart','progress'].includes(type)?'Choose a device and a numeric sensor stream. You can also add a text note without a sensor.':type==='text'?'Choose a text sensor stream. Add one in Devices & data first.':['status','led'].includes(type)?'Choose an on / off sensor stream. Add one in Devices & data first.':'Choose a device and an available sensor stream.');return;}
      next={...next,device_id:d.id,channel_id:c.id,aggregation:stats.includes($('widget-aggregation').value)?$('widget-aggregation').value:'latest'};
      if(['status','led'].includes(type)){next.on_label=$('widget-on-label').value.trim();next.off_label=$('widget-off-label').value.trim();}
      if(['gauge','progress','tank'].includes(type)){
        const minText=$('widget-min').value.trim(),maxText=$('widget-max').value.trim(),min=Number(minText),max=Number(maxText);
        if(!minText||!maxText||!Number.isFinite(min)||!Number.isFinite(max)||min>=max||!Number.isFinite(max-min)){message('widget-error','Enter a finite display minimum below its maximum.');return;}next.min=min;next.max=max;
      }
    }
    if(['multi','bar'].includes(type)){const ids=Array.from($('widget-series').selectedOptions||[]).map(o=>o.value),series=librarySeriesOrder(original?.series,ids),prior=original?.series||[];if(signature(series)!==signature(prior)&&(series.length>5||new Set(series).size!==series.length||series.some(id=>!channels.some(c=>c.id===id&&c.direction==='input'&&c.value_type==='number')))){message('widget-error','Choose up to five distinct numeric input streams from this project.');return;}next.series=series;}
    let normalized;try{applyWidgetSettings(next,{...textFormValues(),icon:$('widget-icon').value,precision:$('widget-precision').value,zeros:$('widget-zeros').checked},original||{});applyBehavior(next,readBehavior(),channels,widgets);normalized=cleanWidget(next);}catch(err){message('widget-error',err.message);return;}const result=editId?widgets.map(w=>w.id===editId?normalized:w):[...widgets];if(!editId)result.splice(insertAt===null?result.length:Math.min(insertAt,result.length),0,normalized);if(result.length>maxWidgets||new Set(result.flatMap(w=>behaviorRefs(w))).size>24){message('widget-error','Keep at most 24 widgets and 24 distinct bound streams for the compatible offline dashboard.');return;}commit(result);insertAt=null;$('widget-dialog').close();
    if(!unbound.includes(type)&&!datasets.has(next.channel_id))await refreshData();
  }
  function finishSaved(parsed){revision=parsed.revision;layoutExtras=clone(parsed.extras);savedExtras=clone(parsed.extras);savedWidgets=clone(parsed.widgets);widgets=clone(parsed.widgets);dashboardTheme=savedTheme=parsed.theme;dirty=false;editing=false;history=[];pendingSave=null;message('dashboard-error','');message('dashboard-notice','Dashboard saved to Supabase. You can reload the page and reopen it.');render();}
  async function save(){
    if(!dirty||saving||!loaded||loadFailed||!project||gestures.isActive())return;
    saving=true;const ctx=context();message('dashboard-error','');render();
    try{
      let fresh=parseRecord(await readRecord());if(!current(ctx))return;
      if(pendingSave&&fresh.token===pendingSave.token){
        const unchanged=layoutSignature()===pendingSave.signature;revision=fresh.revision;savedWidgets=clone(fresh.widgets);savedExtras=clone(fresh.extras);savedTheme=fresh.theme;pendingSave=null;dirty=layoutSignature()!==layoutSignature(savedWidgets,savedTheme,savedExtras);
        if(unchanged){finishSaved(fresh);return;}
      }
      if(fresh.revision!==revision)throw error('The saved dashboard changed in another session. Your draft is still here. Discard changes, then reload the saved layout before editing again.','DASHBOARD_CHANGED');
      const snapshot=widgets.map(cleanWidget),sig=layoutSignature(snapshot,dashboardTheme);
      if(!pendingSave||pendingSave.signature!==sig||pendingSave.baseRevision!==revision)pendingSave={token:crypto.randomUUID(),signature:sig,baseRevision:revision,snapshot:clone(snapshot),theme:THEME_IDS.includes(dashboardTheme)?dashboardTheme:websiteColors()};
      const job=pendingSave;
      const body={widget_type:'note',title:'Project dashboard',config:{...layoutExtras,kind:'dashboard_layout',schema_version:layoutExtras.schema_version===4?4:3,widgets:snapshot,theme:job.theme,save_token:job.token},revision:revision+1};
      if(revision===0)await request('/rest/v1/widgets?on_conflict=id',{method:'POST',authenticated:true,prefer:'resolution=ignore-duplicates,return=minimal',body:{id:project.id,project_id:project.id,...body}});
      else await request('/rest/v1/widgets?id=eq.'+encodeURIComponent(project.id)+'&project_id=eq.'+encodeURIComponent(project.id)+'&revision=eq.'+revision,{method:'PATCH',authenticated:true,prefer:'return=minimal',body});
      if(!current(ctx))return;
      fresh=parseRecord(await readRecord());if(!current(ctx))return;
      if(fresh.token!==job.token||fresh.revision!==job.baseRevision+1)throw error('The save could not be verified, or another session saved first. Your draft is still here. Retry Save dashboard to check before discarding it.','DASHBOARD_SAVE_CHECK');
      finishSaved(fresh);
    }catch(err){if(current(ctx))message('dashboard-error',dashboardError(err,'The dashboard save could not be confirmed. Retry Save dashboard to check the same save safely.'));}
    finally{if(current(ctx)){saving=false;render();}}
  }
  async function stageExperiment(blueprint,target,review){
    if(!project||!loaded||loadFailed||dirty||saving)throw new Error('Save or discard the Dashboard draft before starting an experiment.');
    const ctx=context(),record=await readRecord();if(!current(ctx))throw new Error('The project changed. Open the experiment again.');
    if(JSON.stringify(record)!==review)throw new Error('The Dashboard changed after review. Open the experiment review again; your saved layout is kept.');
    const parsed=parseRecord(record);layoutExtras=clone(parsed.extras);savedExtras=clone(parsed.extras);widgets=clone(parsed.widgets);savedWidgets=clone(parsed.widgets);dashboardTheme=savedTheme=parsed.theme;revision=parsed.revision;
    const primary=channels.find(c=>c.device_id===target.id&&c.channel_key===blueprint.primaryKey);
    const plan=missingExperimentWidgets(blueprint,target,channels,project.id,primary?.id,widgets);
    if(plan.additions.length){startEditing();commit(plan.widgets.map(cleanWidget));message('dashboard-notice','Experiment ready · '+plan.additions.length+' missing cards added to your draft. Review the layout, then Save dashboard to sync it to Android.');}
    else message('dashboard-notice','This experiment is already on your Dashboard. Existing cards, colors, sizes and readings were reused.');
    await refreshData();return plan.additions.length;
  }
  function discard(){if(saving)return;widgets=clone(savedWidgets);dashboardTheme=savedTheme;layoutExtras=clone(savedExtras);dirty=false;editing=false;history=[];pendingSave=null;message('dashboard-error','');message('dashboard-notice','Unsaved changes discarded.');render();}
  function warnBeforeLeave(){message('dashboard-notice',saving?'Please wait for the dashboard save to finish.':'Save your dashboard or choose Discard changes before leaving this project.');}
  function typeOptions(preferred=$('widget-type').value){
    const all=inventory(),found=filterWidgetLibrary(all,$('widget-type-category').value||'All',$('widget-type-search').value),chosen=all.find(i=>i.type===preferred);if(chosen&&!found.some(i=>i.type===preferred))found.unshift(chosen);const select=$('widget-type');select.replaceChildren();for(const category of WIDGET_LIBRARY_GROUPS.slice(1)){const group=document.createElement('optgroup');group.label=category;for(const item of found.filter(i=>i.group===category)){const option=document.createElement('option');option.value=item.type;option.textContent=item.label+(item.enabled?'':' — '+item.reason);option.disabled=!item.enabled&&!canCreateControl(item.type)&&!(editId&&widgets.find(w=>w.id===editId)?.type===item.type);group.append(option);}if(group.children.length)select.append(group);}select.value=chosen?.type||found.find(i=>i.enabled)?.type||'note';$('widget-type-count').textContent=found.length+' of '+all.length+' defined widget types · unavailable choices explain why.';
  }
  function seriesOptions(selected=[]){const select=$('widget-series');select.replaceChildren();const available=channels.filter(c=>c.direction==='input'&&c.value_type==='number');for(const c of available){const option=document.createElement('option');option.value=c.id;option.textContent=streamMappingLabel(c,devices);option.selected=selected.includes(c.id);select.append(option);}for(const id of selected)if(!available.some(c=>c.id===id)){const option=document.createElement('option');option.value=id;option.textContent='Unavailable saved stream · retained';option.selected=true;select.append(option);}}
  function renderLibrary(){
    const all=inventory(),signatureNow=signature([all.map(i=>[i.type,i.enabled,i.reason,i.sources.map(c=>c.id)]),project?.id,libraryCategory,$('widget-library-search').value,loaded,loadFailed,saving,widgets.length>=maxWidgets]);if(signatureNow===librarySignature)return;librarySignature=signatureNow;$('widget-palette').replaceChildren();$('widget-library-categories').replaceChildren();for(const category of WIDGET_LIBRARY_GROUPS){const button=document.createElement('button');button.type='button';button.textContent=category;button.setAttribute('aria-pressed',String(libraryCategory===category));button.addEventListener('click',()=>{libraryCategory=category;renderLibrary();});$('widget-library-categories').append(button);}const found=filterWidgetLibrary(all,libraryCategory,$('widget-library-search').value);for(const item of found){const button=document.createElement('button');button.type='button';button.className='palette-widget';button.setAttribute('data-palette-type',item.type);button.disabled=(!item.enabled&&!canCreateControl(item.type))||!loaded||loadFailed||saving||widgets.length>=maxWidgets;button.setAttribute('aria-label',(item.enabled?'Add ':canCreateControl(item.type)?'Set up ':'Unavailable ')+item.label+'. '+item.reason);button.title=item.reason;const icon=widgetIcon(item.type),label=document.createElement('span'),hint=document.createElement('small');label.textContent=item.label;hint.textContent=item.reason+(!item.enabled&&canCreateControl(item.type)?' Tap to set up its output.':'');button.append(icon,label,hint);button.addEventListener('pointerdown',event=>{if(!button.disabled&&item.enabled)gestures.beginAdd(event,item.type,item.label);});button.addEventListener('click',()=>{if(!button.disabled&&!gestures.consumeClick())newWidget(item.type);});$('widget-palette').append(button);}$('widget-library-count').textContent=found.length+' of '+all.length+' defined widget types · '+found.filter(i=>i.enabled).length+' ready to add · '+found.filter(i=>!i.enabled&&canCreateControl(i.type)).length+' need stream setup.';show('widget-library-empty',!found.length);
  }
  $('widget-library-search').addEventListener('input',renderLibrary);$('widget-type-search').addEventListener('input',()=>typeOptions());$('widget-type-category').addEventListener('change',()=>typeOptions());
  $('dashboard-blueprint-add').addEventListener('click',openBlueprint);$('blueprint-select').addEventListener('change',blueprintFields);$('blueprint-device').addEventListener('change',blueprintFields);$('blueprint-channel').addEventListener('change',blueprintPreview);$('blueprint-apply').addEventListener('click',applyBlueprint);$('dashboard-blueprint-capture').addEventListener('click',openBlueprintCapture);$('blueprint-capture-form').addEventListener('submit',captureBlueprint);
  for(const id of ['dashboard-viewer-group','dashboard-viewer-device'])$(id).addEventListener('change',()=>{if(editing||saving)return;datasets=new Map();render();return refreshData();});
  $('dashboard-clear-filters').addEventListener('click',()=>{$('dashboard-viewer-section').value='';if(editing||saving)return;$('dashboard-viewer-group').value='';$('dashboard-viewer-device').value='';datasets=new Map();render();return refreshData();});
  $('dashboard-viewer-section').addEventListener('change',()=>{media.stopAll();render();if(active)refreshData();});
  $('dashboard-phone-preview').addEventListener('click',()=>{const on=!phonePreview();gestures.cancel();phoneGestures.cancel();media.stopAll();controlClient.stop();$('dashboard-phone-preview').setAttribute('aria-pressed',String(on));render();return refreshData();});
  for(const id of ['dashboard-phone-width','dashboard-phone-scale'])$(id).addEventListener('change',render);
  $('dashboard-phone-studio').addEventListener('click',event=>{event.preventDefault();openPhoneEditor();});
  $('dashboard-edit').addEventListener('click',startEditing);$('dashboard-add').addEventListener('click',newWidget);$('dashboard-first-widget').addEventListener('click',newWidget);
  $('widget-form').addEventListener('submit',applyWidget);$('widget-type').addEventListener('change',()=>{if(['panel','chart','table','heading','divider','camera','multi','bar','timeline','heatmap','vector','gps'].includes($('widget-type').value))$('widget-width').value='full';sourceOptions();seriesOptions([]);formFields();});
  $('widget-camera-mode').addEventListener('change',()=>{sourceOptions();seriesOptions([]);formFields();});$('dashboard-auto-refresh').addEventListener('change',()=>{autoPreferred=$('dashboard-auto-refresh').checked;$('dashboard-data-state').textContent=autoPreferred?'Automatic refresh enabled · next check in 5s':'Automatic refresh paused · use Refresh data';queueAuto();});$('dashboard-theme').addEventListener('change',()=>{if(saving||!loaded||loadFailed)return;const next=$('dashboard-theme').value;if(!['site',...THEME_IDS].includes(next))return;if(!editing)startEditing();commit(clone(widgets),next==='site'?websiteColors():next);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(autoTimer);autoVersion++;clearTimeout(syncTimer);syncVersion++;}else{queueAuto();queueLayoutSync();}});addEventListener('pagehide',deactivate);
  $('widget-create-control-stream').addEventListener('click',()=>addControlStream($('widget-type').value,$('widget-device').value).catch(e=>message('widget-error',e.message)));
  $('widget-device').addEventListener('change',()=>{streamOptions();formFields();});$('widget-channel').addEventListener('change',()=>{streamOptions($('widget-channel').value);formFields();});
  $('dashboard-save').addEventListener('click',save);$('dashboard-discard').addEventListener('click',discard);
  $('dashboard-undo').addEventListener('click',()=>{if(!history.length||saving)return;const prior=history.pop();widgets=prior.widgets;dashboardTheme=prior.theme;layoutExtras=clone(prior.extras||savedExtras);dirty=layoutSignature()!==layoutSignature(savedWidgets,savedTheme,savedExtras);render();});
  $('dashboard-refresh').addEventListener('click',refreshData);
  $('dashboard-range').addEventListener('change',()=>{datasets=new Map();render();return refreshData();});
  $('dashboard-reload').addEventListener('click',async()=>{if(dirty||saving||!project)return;message('dashboard-error','');await loadLayout();await refreshData();});
  addEventListener('beforeunload',event=>{if(dirty||saving){event.preventDefault();event.returnValue='';}});
  return {openPhoneEditor,open,reset,deactivate,refreshData,stageExperiment,isActive:()=>active,hasPendingChanges:()=>dirty||saving,warnBeforeLeave,libraryChanged:()=>{if(project){render();if(active)return refreshData();}},blocksClose:id=>['widget-dialog','blueprint-dialog','blueprint-capture-dialog'].includes(id)&&saving};
}
