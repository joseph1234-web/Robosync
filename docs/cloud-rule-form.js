export function cloudRuleValues(raw, channelIds){
  const number=(key,lo,hi,whole=false)=>{const v=raw[key];if(v===null||v===undefined||typeof v==='boolean'||String(v).trim()==='')throw new Error('Complete every threshold and timing value.');const n=Number(v);if(!Number.isFinite(n)||n<lo||n>hi||whole&&!Number.isInteger(n))throw new Error('Use finite thresholds and whole timing seconds within the shown limits.');return n;};
  const name=String(raw.name??'').trim(),operator=raw.operator,channel=raw.channel_id;
  if(!name||name.length>80||!['above','below'].includes(operator)||!channelIds.includes(channel))throw new Error('Choose a rule name, trigger direction and available hardware input.');
  const threshold=number('threshold',-1e9,1e9),reset_threshold=number('reset_threshold',-1e9,1e9);
  if(operator==='above'?reset_threshold>threshold:reset_threshold<threshold)throw new Error('Reset must be toward the normal range: at/below an Above trigger, or at/above a Below trigger.');
  return {name,channel_id:channel,operator,threshold,reset_threshold,hold_seconds:number('hold_seconds',0,3600,true),cooldown_seconds:number('cooldown_seconds',0,86400,true),max_gap_seconds:number('max_gap_seconds',1,3600,true),severity:['info','warning','critical'].includes(raw.severity)?raw.severity:'warning',enabled:raw.enabled!==false};
}
