// Deterministic replay of saved samples. This is not a background or device runner.
export function normalizeThresholdRule(raw) {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const fail=text=>{const err=new Error(text);err.code='RULE_FORMAT';throw err;};
  const legacy=raw?.schema_version===1&&raw.simulation_only===true;
  const hardware=raw?.schema_version===2&&raw.simulation_only===false&&raw.source_mode==='hardware'&&raw.execution==='manual_replay';
  if(!raw||raw.kind!=='threshold'||(!legacy&&!hardware))fail('This rule format is not supported. It has not been changed.');
  if(!uuid.test(raw.device_id)||!uuid.test(raw.channel_id))fail('Choose a device and numeric sensor stream.');
  if(!['above','below'].includes(raw.operator))fail('Choose Above or Below.');
  if(typeof raw.threshold!=='number'||!Number.isFinite(raw.threshold)||typeof raw.reset_threshold!=='number'||!Number.isFinite(raw.reset_threshold))fail('Enter finite trigger and reset values.');
  if(raw.operator==='above'&&raw.reset_threshold>raw.threshold)fail('For Above, the reset value must be at or below the trigger value.');
  if(raw.operator==='below'&&raw.reset_threshold<raw.threshold)fail('For Below, the reset value must be at or above the trigger value.');
  for(const key of ['hold_seconds','cooldown_seconds'])if(!Number.isInteger(raw[key])||raw[key]<0||raw[key]>86400)fail('Hold time and cooldown must be whole seconds from 0 to 86,400.');
  if(!Number.isInteger(raw.max_gap_seconds)||raw.max_gap_seconds<1||raw.max_gap_seconds>86400)fail('The maximum sample gap must be 1 to 86,400 whole seconds.');
  if(!raw.action||raw.action.type!=='event'||!['info','warning','critical'].includes(raw.action.severity)||typeof raw.action.title!=='string'||!raw.action.title.trim()||raw.action.title.length>200)fail('Choose an event severity and a message of 1–200 characters.');
  return {kind:'threshold',schema_version:hardware?2:1,simulation_only:!hardware,...(hardware?{source_mode:'hardware',execution:'manual_replay'}:{}),device_id:raw.device_id,channel_id:raw.channel_id,operator:raw.operator,threshold:raw.threshold,reset_threshold:raw.reset_threshold,hold_seconds:raw.hold_seconds,cooldown_seconds:raw.cooldown_seconds,max_gap_seconds:raw.max_gap_seconds,action:{type:'event',severity:raw.action.severity,title:raw.action.title},...(typeof raw.save_token==='string'?{save_token:raw.save_token}:{})};
}
export function evaluateThresholdRule(raw,readings) {
  const rule=normalizeThresholdRule(raw),events=[];
  let since=null,active=false,lastTrigger=null,lastTime=null,samples=0,excluded=0,gaps=0,estimated=0;
  const hardware=rule.schema_version===2;
  const unique=new Map();
  for(const row of readings){if(row?.id&&!unique.has(row.id))unique.set(row.id,row);else if(!row?.id)unique.set(Symbol(),row);}
  const timed=[];
  for(const row of unique.values()){if(row?.channel_id!==rule.channel_id){excluded++;continue;}const t=Date.parse(row?.recorded_at);if(!Number.isFinite(t)){excluded++;continue;}timed.push({row,t});}
  timed.sort((a,b)=>a.t-b.t||String(a.row.id||'').localeCompare(String(b.row.id||'')));
  for(const {row,t} of timed){
    if(lastTime!==null&&t-lastTime>rule.max_gap_seconds*1000){since=null;active=false;gaps++;}
    lastTime=t;
    if(!(hardware?['ok','estimated'].includes(row.quality):row.quality==='estimated')||typeof row.value_num!=='number'||!Number.isFinite(row.value_num)){since=null;active=false;excluded++;continue;}
    samples++;if(row.quality==='estimated')estimated++;const value=row.value_num;
    const qualifies=rule.operator==='above'?value>rule.threshold:value<rule.threshold;
    const resets=rule.operator==='above'?value<=rule.reset_threshold:value>=rule.reset_threshold;
    if(active){
      if(resets){events.push({kind:'reset',at:row.recorded_at,value,reading_id:row.id||null,...(hardware?{quality:row.quality}:{})});active=false;since=null;}
      continue;
    }
    if(!qualifies){since=null;continue;}
    if(since===null)since=t;
    if(t-since>=rule.hold_seconds*1000&&(lastTrigger===null||t-lastTrigger>=rule.cooldown_seconds*1000)){
      events.push({kind:'trigger',at:row.recorded_at,value,reading_id:row.id||null,...(hardware?{quality:row.quality}:{})});active=true;lastTrigger=t;
    }
  }
  return {events,samples,excluded,gaps,activeAtEnd:active,initialState:'inactive',...(hardware?{estimatedSamples:estimated}:{})};
}
