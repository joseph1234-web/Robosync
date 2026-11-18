// Display-only classroom projection. No persistence, media URL or owner editing path.
export function cleanSharedSnapshot(raw, projectId){
  const fail=()=>{throw new Error('Shared access or response could not be verified. Reopen the project.');};
  const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  const text=(v,max)=>{if(v==null)return '';if(typeof v!=='string'||v.length>max)fail();return v;};
  if(!uuid(projectId)||raw?.project?.id!==projectId||raw.shared_view_version!==2||raw.can_arrange!==false||raw.permissions?.view!==true||raw.permissions?.edit!==false||raw.permissions?.drive!==false||!Array.isArray(raw.sources)||raw.sources.length>24||!Number.isFinite(Date.parse(raw.refreshed_at)))fail();
  const widgets=raw.dashboard?.config?.widgets||[];if(!Array.isArray(widgets)||widgets.length>24)fail();const bindings=new Map();for(const w of widgets){if(!uuid(w.id))fail();if(w.channel_id){if(!uuid(w.device_id)||!uuid(w.channel_id)||bindings.has(w.channel_id)&&bindings.get(w.channel_id)!==w.device_id)fail();bindings.set(w.channel_id,w.device_id);}}
  const seen=new Set(),sources=[];
  for(const source of raw.sources){const d=source.device,c=source.channel;if(!d||!c||!uuid(d.id)||!uuid(c.id)||d.id!==c.device_id||bindings.get(c.id)!==d.id||seen.has(c.id)||!['number','boolean','text'].includes(c.value_type)||!Array.isArray(source.readings)||source.readings.length>100)fail();seen.add(c.id);const readings=[];
    for(const row of source.readings){if(!uuid(row.id)||row.channel_id!==c.id||!Number.isFinite(Date.parse(row.recorded_at)))fail();if(['bad','invalid','stale'].includes(row.quality))continue;const value=row[c.value_type==='number'?'value_num':c.value_type==='boolean'?'value_bool':'value_text'];if(c.value_type==='number'?typeof value!=='number'||!Number.isFinite(value):c.value_type==='boolean'?typeof value!=='boolean':typeof value!=='string'||value.length>4096)continue;readings.push({id:row.id,channel_id:c.id,recorded_at:row.recorded_at,quality:text(row.quality,40),...(c.value_type==='number'?{value_num:value}:c.value_type==='boolean'?{value_bool:value}:{value_text:value})});}
    readings.sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at));sources.push({device:{id:d.id,label:text(d.label,200)},channel:{id:c.id,device_id:d.id,title:text(c.title,200),unit:text(c.unit,80),value_type:c.value_type},readings});
  }
  return {project:{id:projectId,name:text(raw.project.name,200)},sources,refreshed_at:raw.refreshed_at};
}
