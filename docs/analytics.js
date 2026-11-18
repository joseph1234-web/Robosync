import { summarizeAnalytics, bucketAnalytics, analyticsReadingsCsv, analyticsCsvCell } from './analytics-math.js?v=0.36.1';
export function createAnalytics({request,friendlyError,getSession,getGeneration}){
  const $=id=>document.getElementById(id),show=(id,on=true)=>{$(id).hidden=!on;},message=(id,text)=>{$(id).textContent=text;show(id,!!text);};
  let project=null,devices=[],sources=[],snapshot=null,version=0,requestVersion=0,loading=false,dirty=false;
  const context=()=>({version,generation:getGeneration(),projectId:project?.id});
  const current=ctx=>!!project&&!!getSession()&&ctx.version===version&&ctx.generation===getGeneration()&&ctx.projectId===project.id;
  const rows=value=>{if(!Array.isArray(value))throw new Error('Unexpected database response');return value;};
  const number=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:2}):'—';
  const date=value=>{const t=new Date(value);return Number.isNaN(t.getTime())?'Unavailable':t.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});};
  function controls(){
    for(const id of ['analytics-stream-1','analytics-stream-2','analytics-stream-3','analytics-range','analytics-bucket','analytics-interval','analytics-from','analytics-to'])$(id).disabled=loading;
    $('analytics-apply').disabled=loading||!sources.length;$('analytics-apply').textContent=loading?'Loading…':'Apply filters';
    const dataReady=snapshot&&!dirty&&!loading;
    $('analytics-csv').disabled=!dataReady||!snapshot.results.some(r=>r.rows.length);
    $('analytics-report').disabled=!dataReady||!snapshot.results.some(r=>r.rows.length);
    $('analytics-events-csv').disabled=!dataReady||!snapshot.events.rows.length;
  }
  function reset(){version++;requestVersion++;project=null;devices=[];sources=[];snapshot=null;loading=false;dirty=false;$('analytics-summary-body').replaceChildren();$('analytics-charts').replaceChildren();$('analytics-event-list').replaceChildren();$('analytics-report-content').replaceChildren();$('analytics-context').replaceChildren();$('analytics-event-summary').textContent='';for(let i=1;i<=3;i++){$('analytics-stream-'+i).replaceChildren();$('analytics-stream-'+i).value='';}$('analytics-notes').value='';show('analytics-results',false);show('analytics-loading',false);message('analytics-error','');message('analytics-notice','');if($('analytics-report-dialog').open)$('analytics-report-dialog').close();$('analytics-setup-check').textContent='7';$('analytics-setup-check').classList.toggle('pending',true);controls();}
  function populateSources(){
    for(let i=1;i<=3;i++){
      const el=$('analytics-stream-'+i),previous=el.value;el.replaceChildren();
      if(i>1||!sources.length){const none=document.createElement('option');none.value='';none.textContent=i>1?'No comparison':'No numeric streams available';el.append(none);}
      for(const source of sources){const option=document.createElement('option');option.value=source.channel.id;option.textContent=source.device.label+' / '+source.channel.title+(source.channel.unit?' ('+source.channel.unit+')':'');el.append(option);}
      el.value=sources.some(s=>s.channel.id===previous)?previous:i===1?(sources.find(s=>s.channel.channel_key==='temperature')||sources[0])?.channel.id||'':'';
    }
  }
  async function open(nextProject,nextDevices){
    if(project?.id!==nextProject.id){reset();project=nextProject;$('analytics-range').value='24';$('analytics-bucket').value='60';$('analytics-interval').value='60';show('analytics-custom-range',false);}
    devices=nextDevices.filter(d=>d.project_id===project.id);version++;const ctx=context();loading=true;dirty=false;snapshot=null;show('analytics-results',false);controls();show('analytics-loading');
    try{
      const all=[];for(let i=0;i<devices.length;i+=40){const ids=devices.slice(i,i+40).map(d=>d.id);const data=rows(await request('/rest/v1/channels?select=id,device_id,channel_key,title,unit,value_type&device_id=in.('+ids.join(',')+')&order=title.asc&limit=1000',{authenticated:true}));if(!current(ctx))return;all.push(...data);}
      if(!current(ctx))return;sources=all.filter(c=>c.value_type==='number').map(channel=>({channel,device:devices.find(d=>d.id===channel.device_id)})).filter(s=>s.device);populateSources();
      if(!sources.length){message('analytics-notice','Add a simulated device and numeric stream in Devices & data, then return to Analytics.');return;}
      await applyFilters();
    }catch(err){if(current(ctx))message('analytics-error',friendlyError(err,'Couldn’t load sensor sources. Reopen Analytics to retry.'));}
    finally{if(current(ctx)){loading=false;show('analytics-loading',false);controls();}}
  }
  function readSettings(){
    const ids=[1,2,3].map(i=>$('analytics-stream-'+i).value).filter(Boolean);if(!ids.length)throw new Error('Choose a primary sensor stream.');if(new Set(ids).size!==ids.length)throw new Error('Choose different streams for comparison.');
    const selected=ids.map(id=>sources.find(s=>s.channel.id===id));if(selected.some(s=>!s))throw new Error('Choose streams from this project.');
    const now=new Date(),range=$('analytics-range').value;let from,to;
    if(range==='custom'){if(!$('analytics-from').value||!$('analytics-to').value)throw new Error('Choose both custom dates.');from=new Date($('analytics-from').value);to=new Date($('analytics-to').value);}
    else{const hours=Number(range);if(![1,24,168].includes(hours))throw new Error('Choose a supported time range.');to=now;from=new Date(to.getTime()-hours*3600000);}
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to)throw new Error('The start time must be before the end time.');
    if(to-from>31*86400000)throw new Error('Choose a range of at most 31 days.');
    const expected=Number($('analytics-interval').value);if(!Number.isInteger(expected)||expected<1||expected>86400)throw new Error('Expected sample interval must be 1–86,400 whole seconds.');
    const bucket=Number($('analytics-bucket').value);if(![60,300,900,3600].includes(bucket))throw new Error('Choose a supported chart interval.');
    return {selected,from:from.toISOString(),to:to.toISOString(),capturedAt:now.toISOString(),expected,bucket};
  }
  async function fetchPages(table,timeField,baseParams,cap,ctx,run){
    let cursor=null,all=[],limited=false;const seen=new Set();
    for(let page=0;page<25;page++){
      if(!current(ctx)||run!==requestVersion)return {rows:[],limited:false};
      const params=new URLSearchParams(baseParams);params.set('order',timeField+'.desc,id.desc');params.set('limit',String(Math.min(500,cap+1-all.length)));
      if(cursor)params.set('or','('+timeField+'.lt.'+JSON.stringify(cursor.time)+',and('+timeField+'.eq.'+JSON.stringify(cursor.time)+',id.lt.'+JSON.stringify(cursor.id)+'))');
      const data=rows(await request('/rest/v1/'+table+'?'+params.toString(),{authenticated:true}));if(!current(ctx)||run!==requestVersion)return {rows:[],limited:false};
      if(!data.length)return {rows:all,limited:false};
      const last=data.at(-1);if(typeof last.id!=='string'||typeof last[timeField]!=='string')throw new Error('History returned an invalid pagination key.');
      const next={id:last.id,time:last[timeField]};if(cursor&&cursor.id===next.id&&cursor.time===next.time)throw new Error('History pagination did not advance. Try a narrower range.');
      for(const row of data)if(!seen.has(row.id)){seen.add(row.id);all.push(row);}
      cursor=next;if(all.length>cap){limited=true;break;}if(page===24)limited=true;
    }
    return {rows:all.slice(0,cap),limited};
  }
  async function applyFilters(event){
    event?.preventDefault();if(!project||!getSession())return;
    let settings;try{settings=readSettings();}catch(err){dirty=true;message('analytics-error',err.message);controls();return;}
    const ctx=context(),run=++requestVersion;loading=true;dirty=false;snapshot=null;message('analytics-error','');message('analytics-notice','');show('analytics-results',false);show('analytics-loading');controls();
    const timeFilter=field=>'('+field+'.gte.'+JSON.stringify(settings.from)+','+field+'.lte.'+JSON.stringify(settings.to)+')';
    try{
      const tasks=settings.selected.map(async source=>{
        try{const data=await fetchPages('telemetry','recorded_at',{select:'id,channel_id,value_num,recorded_at,received_at,quality',channel_id:'eq.'+source.channel.id,and:timeFilter('recorded_at'),received_at:'lte.'+settings.capturedAt},5000,ctx,run);return {source,...data,stats:summarizeAnalytics(data.rows,settings.expected),buckets:bucketAnalytics(data.rows,settings.bucket),error:null};}
        catch(err){return {source,rows:[],limited:false,stats:null,buckets:{seconds:settings.bucket,buckets:[]},error:friendlyError(err,'Couldn’t load this stream. Try a narrower range or Apply filters again.')};}
      });
      const deviceIds=[...new Set(settings.selected.map(s=>s.device.id))];
      const eventTask=(async()=>{try{return {...await fetchPages('events','occurred_at',{select:'id,device_id,event_type,severity,title,occurred_at,received_at,acknowledged_at,detail',device_id:'in.('+deviceIds.join(',')+')',and:timeFilter('occurred_at'),received_at:'lte.'+settings.capturedAt},200,ctx,run),error:null};}catch(err){return {rows:[],limited:false,error:friendlyError(err,'Couldn’t load the event summary. Try Apply filters again.')};}})();
      const completed=await Promise.allSettled([...tasks,eventTask]);if(!current(ctx)||run!==requestVersion)return;
      const unexpected=completed.find(r=>r.status==='rejected');if(unexpected)throw unexpected.reason;
      const results=completed.slice(0,-1).map(r=>r.value),events=completed.at(-1).value;snapshot={settings,results,events};
      render();show('analytics-results');
      const failed=results.filter(r=>r.error).length+(events.error?1:0);if(failed)message('analytics-error','Some results could not be loaded. Unavailable sources are marked below; exports contain only successfully loaded records.');
      if(results.some(r=>r.limited)||events.limited)message('analytics-notice','A loading limit was reached. Statistics, charts, and exports use only the loaded newest records. Narrow the range for a fuller view.');
      $('analytics-setup-check').textContent='✓';$('analytics-setup-check').classList.toggle('pending',false);$('analytics-setup-text').textContent='Analytics loaded. Export readings or preview an experiment report.';
    }catch(err){if(current(ctx)&&run===requestVersion)message('analytics-error',friendlyError(err,'Couldn’t load analytics. Try a narrower range.'));}
    finally{if(current(ctx)&&run===requestVersion){loading=false;show('analytics-loading',false);controls();}}
  }
  function svg(name,attrs={},text){const node=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;return node;}
  function chart(result){
    const {buckets}=result.buckets;if(!buckets.length){const p=document.createElement('p');p.className='chart-empty';p.textContent='No valid numeric readings in the loaded records.';return p;}
    const min=Math.min(...buckets.map(b=>b.min)),max=Math.max(...buckets.map(b=>b.max)),scale=Math.max(1,Math.abs(min),Math.abs(max)),lo=min/scale,hi=max/scale,pad=lo===hi?.1:(hi-lo)*.12,lower=lo-pad,upper=hi+pad;
    const start=buckets[0].time,end=buckets.at(-1).time,x=t=>start===end?285:55+(t-start)/(end-start)*475,y=n=>18+(upper-n/scale)/(upper-lower)*145;
    const plot=svg('svg',{viewBox:'0 0 550 200',class:'sensor-chart',role:'img','aria-label':result.source.channel.title+': sample means with minimum-to-maximum ranges in '+result.source.channel.unit+'. Missing buckets are gaps.'});
    for(let i=0;i<4;i++){const value=lower+(upper-lower)*i/3,pos=18+(upper-value)/(upper-lower)*145;plot.append(svg('line',{x1:55,x2:530,y1:pos,y2:pos,stroke:'#e3ede6','stroke-width':1}));plot.append(svg('text',{x:0,y:pos+4,fill:'#8ba394','font-size':10},number(value*scale)));}
    let path='',previous=null;
    for(const b of buckets){plot.append(svg('line',{x1:x(b.time),x2:x(b.time),y1:y(b.min),y2:y(b.max),stroke:'#99c8ad','stroke-width':3,'stroke-linecap':'round'}));path+=(previous!==null&&b.time-previous<=result.buckets.seconds*1000?' L':' M')+x(b.time).toFixed(2)+' '+y(b.mean).toFixed(2);previous=b.time;}
    plot.append(svg('path',{d:path,stroke:'#007f79','stroke-width':2,fill:'none','stroke-linejoin':'round'}));
    for(const b of buckets)plot.append(svg('circle',{cx:x(b.time),cy:y(b.mean),r:2.2,fill:'#007f79'}));
    const time=t=>new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    plot.append(svg('text',{x:55,y:190,fill:'#8ba394','font-size':10},time(start)));plot.append(svg('text',{x:530,y:190,'text-anchor':'end',fill:'#8ba394','font-size':10},time(end)));return plot;
  }
  function chartInfo(result){return 'Chart: '+number(result.buckets.seconds/60)+'-minute buckets. Line = sample average; vertical ranges = minimum–maximum. Missing buckets stay empty.';}
  function sourceName(source){return source.device.label+' / '+source.channel.title;}
  function appendText(parent,tag,text,className){const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;parent.append(node);return node;}
  function render(){
    const {settings,results,events}=snapshot;$('analytics-context').replaceChildren();appendText($('analytics-context'),'span','Requested: '+date(settings.from)+' → '+date(settings.to));appendText($('analytics-context'),'span','Loaded '+date(settings.capturedAt)+' · Statistics use all valid loaded samples');
    $('analytics-summary-body').replaceChildren();$('analytics-charts').replaceChildren();
    for(const result of results){
      const s=result.stats,tr=document.createElement('tr'),first=appendText(tr,'td',sourceName(result.source));appendText(first,'small',result.source.channel.unit||'No unit');
      for(const value of [s?number(s.count)+' / '+number(s.records):'Unavailable',s?number(s.min):'—',s?number(s.mean):'—',s?number(s.median):'—',s?number(s.max):'—',s?number(s.excluded):'—'])appendText(tr,'td',value);$('analytics-summary-body').append(tr);
      const card=document.createElement('section');card.className='analytics-chart-card';appendText(card,'h3',sourceName(result.source));appendText(card,'p',(result.source.device.config?.mode==='simulation'?'SIMULATED':'REGISTERED DEVICE')+' · '+(result.source.channel.unit||'No unit')+' · '+chartInfo(result),'analytics-chart-meta');
      if(result.error)appendText(card,'p',result.error,'widget-error-state');else{card.append(chart(result));const quality=document.createElement('div');quality.className='analytics-quality';appendText(quality,'span','Estimated valid samples: '+number(s.estimated));appendText(quality,'span','Long gaps: '+number(s.gaps));appendText(quality,'span','Estimated missing valid samples: '+number(s.missing));card.append(quality);appendText(card,'p','Gap estimates use '+settings.expected+' seconds between valid observations, only within the loaded first-to-last sample span.','form-help');if(s.first)appendText(card,'p','Loaded span: '+date(s.first)+' → '+date(s.last),'form-help');if(result.limited)appendText(card,'p','Partial history: showing '+s.records+' newest loaded records. Statistics and exports are limited to this subset.','analytics-limits');}
      $('analytics-charts').append(card);
    }
    renderEvents(events);controls();
  }
  function renderEvents(events){
    $('analytics-event-list').replaceChildren();
    if(events.error){$('analytics-event-summary').textContent='Event summary unavailable';appendText($('analytics-event-list'),'p',events.error,'widget-error-state');return;}
    const warnings=events.rows.filter(e=>e.severity!=='info').length,unack=events.rows.filter(e=>e.severity!=='info'&&!e.acknowledged_at).length;
    $('analytics-event-summary').textContent=events.rows.length+' loaded events · '+warnings+' warning/critical · '+unack+' unacknowledged'+(events.limited?' · Partial history':'');
    for(const event of events.rows.slice(0,10)){const row=document.createElement('div');row.className='event-row';const symbol=appendText(row,'span',event.severity==='info'?'✓':'!','event-symbol'+(event.severity==='info'?'':' warning'));symbol.setAttribute('aria-hidden','true');const copy=document.createElement('div');copy.className='event-copy';appendText(copy,'strong',event.title);appendText(copy,'p',date(event.occurred_at)+' · '+event.severity+(event.detail?.source==='simulation'?' · SIMULATED':event.detail?.source==='hardware'?' · HARDWARE':'')+(event.detail?.mode==='manual_replay'?' · Historical rule test':''));row.append(copy);$('analytics-event-list').append(row);}
    if(!events.rows.length)appendText($('analytics-event-list'),'p','No events match this time range for the selected devices.','small-empty-text');else if(events.rows.length>10)appendText($('analytics-event-list'),'p','Showing the latest 10 of '+events.rows.length+' loaded events. Export events CSV for the loaded list.','form-help');
  }
  function markDirty(){dirty=true;if(snapshot)message('analytics-notice','Filters changed. Apply filters before exporting or previewing a report.');controls();}
  function ready(){return snapshot&&!dirty&&!loading;}
  function download(text,prefix){const blob=new Blob([text],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=prefix+'_'+snapshot.settings.capturedAt.slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportReadings(){if(ready()&&snapshot.results.some(r=>r.rows.length))download(analyticsReadingsCsv(snapshot.results),'RoboSynct_Analytics');}
  function exportEvents(){
    if(!ready()||!snapshot.events.rows.length)return;
    const fields=['event_id','device','type','severity','title','logged_at_utc','acknowledged_at_utc','source','mode','rule_id','observed_at_utc'],out=[fields.map(analyticsCsvCell).join(',')];
    for(const e of snapshot.events.rows)out.push([e.id,devices.find(d=>d.id===e.device_id)?.label||e.device_id,e.event_type,e.severity,e.title,e.occurred_at,e.acknowledged_at,e.detail?.source,e.detail?.mode,e.detail?.rule_id,e.detail?.observed_at].map(analyticsCsvCell).join(','));download('\uFEFF'+out.join('\r\n'),'RoboSynct_Events');
  }
  function previewReport(){
    if(!ready()||!snapshot.results.some(r=>r.rows.length))return;
    const {settings,results,events}=snapshot,root=$('analytics-report-content');root.replaceChildren();appendText(root,'div','ROBOSYNCT / EXPERIMENT REPORT','report-brand');appendText(root,'h1',project.name);if(project.description)appendText(root,'p',project.description,'report-meta');
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Browser local time';appendText(root,'p','Requested range (UTC): '+settings.from+' to '+settings.to+'\nCaptured (UTC): '+settings.capturedAt+'\nChart and event display timezone: '+zone+'\nExpected interval for gap estimates: '+settings.expected+' seconds.','report-meta');
    const note=$('analytics-notes').value.trim();if(note){const section=document.createElement('section');section.className='report-section';appendText(section,'h2','Experiment note');appendText(section,'div',note.slice(0,2000),'report-note');root.append(section);}
    for(const result of results){
      const section=document.createElement('section');section.className='report-section';appendText(section,'h2',sourceName(result.source));appendText(section,'span',result.source.device.config?.mode==='simulation'?'SIMULATED DATA':'REGISTERED DEVICE','sim-badge');appendText(section,'p','Unit: '+(result.source.channel.unit||'Not specified'));
      if(result.error)appendText(section,'p','This source could not be loaded: '+result.error,'report-source-error');else{
        const s=result.stats,table=document.createElement('table');table.className='report-metrics';
        for(const values of [['Loaded records',s.records,'Valid samples',s.count],['Minimum',number(s.min),'Maximum',number(s.max)],['Sample average',number(s.mean),'Median',number(s.median)],['Estimated valid',s.estimated,'Excluded samples',s.excluded],['Long gaps',s.gaps,'Estimated missing valid',s.missing]]){const row=document.createElement('tr');for(let i=0;i<values.length;i++)appendText(row,i%2?'td':'th',String(values[i]));table.append(row);}section.append(table);section.append(chart(result));appendText(section,'p',chartInfo(result));appendText(section,'p','Loaded valid span: '+(s.first?date(s.first)+' to '+date(s.last):'No valid observations')+'. Gap estimates apply only between loaded valid samples.');if(result.limited)appendText(section,'p','PARTIAL HISTORY: only the newest '+s.records+' loaded records were included. Narrow the time range for a fuller view.','report-source-error');
      }
      root.append(section);
    }
    const eventSection=document.createElement('section');eventSection.className='report-section';appendText(eventSection,'h2','Events for selected devices');
    if(events.error)appendText(eventSection,'p','Event summary unavailable: '+events.error,'report-source-error');else{
      appendText(eventSection,'p',events.rows.length+' events loaded'+(events.limited?' (partial history)':'')+'. Showing the latest '+Math.min(10,events.rows.length)+'. Events use logging time, which may differ from the original observation time.');for(const e of events.rows.slice(0,10))appendText(eventSection,'div',date(e.occurred_at)+' / '+e.severity+' / '+e.title+(e.detail?.source==='simulation'?' / SIMULATED':e.detail?.source==='hardware'?' / HARDWARE':'')+(e.detail?.mode==='manual_replay'?' / HISTORICAL REPLAY':''),'report-event-row');
    }
    root.append(eventSection);appendText(root,'p','Statistics describe the loaded records only. Invalid/stale and non-numeric samples are excluded, not converted to zero. Averages are sample means, not time-weighted means. Chart lines connect adjacent populated buckets; empty buckets remain gaps. Charts may automatically use wider intervals to keep the view readable. Simulated values are generated learning data, not physical measurements.','report-disclosure');$('analytics-report-dialog').showModal();
  }
  $('analytics-filter-form').addEventListener('submit',applyFilters);
  for(const id of ['analytics-stream-1','analytics-stream-2','analytics-stream-3','analytics-bucket','analytics-interval','analytics-from','analytics-to'])$(id).addEventListener('change',markDirty);
  $('analytics-range').addEventListener('change',()=>{show('analytics-custom-range',$('analytics-range').value==='custom');markDirty();});
  $('analytics-csv').addEventListener('click',exportReadings);$('analytics-events-csv').addEventListener('click',exportEvents);$('analytics-report').addEventListener('click',previewReport);$('analytics-print').addEventListener('click',()=>{if($('analytics-report-dialog').open)window.print();});
  return {open,reset};
}
