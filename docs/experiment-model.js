import { BUILTIN_BLUEPRINTS, cleanBlueprint, cleanDeviceTemplate, instantiateBlueprint, templateChannelPlan } from './library-model.js?v=0.36.1';

// Experiments link existing versioned templates and blueprints. No parallel store.
export function experimentBlueprint(template,blueprints=[]){
  const t=cleanDeviceTemplate(template),ref=t.blueprint_ref;
  if(ref){const b=[...BUILTIN_BLUEPRINTS,...blueprints].find(b=>b.id===ref.id&&b.version===ref.version);if(!b)throw new Error('This experiment needs its saved blueprint version. Restore it in the project library.');return cleanBlueprint(b);}
  if(t.channels.length!==1)throw new Error('This multi-stream template needs a linked Dashboard blueprint. Capture an experiment from its Dashboard first, or use Apply streams only.');
  return cleanBlueprint(BUILTIN_BLUEPRINTS.find(b=>b.widgets.some(w=>w.value_type===t.channels[0].value_type)));
}
export function missingExperimentWidgets(blueprint,device,channels,projectId,primaryChannelId,existing){
  if(!Array.isArray(existing)||existing.length>24||new Set(existing.map(w=>w.id)).size!==existing.length)throw new Error('The saved Dashboard needs review before starting this experiment.');
  const candidates=instantiateBlueprint(blueprint,device,channels,projectId,primaryChannelId),used=new Set(),steps=[];
  for(const candidate of candidates){
    const match=existing.find(w=>!used.has(w.id)&&w.type===candidate.type&&(candidate.channel_id?w.device_id===candidate.device_id&&w.channel_id===candidate.channel_id&&(w.aggregation||'latest')===(candidate.aggregation||'latest'):w.title===candidate.title&&(w.note||'')===(candidate.note||'')));
    if(match)used.add(match.id);steps.push({status:match?'reuse':'add',widget:match||candidate});
  }
  const additions=steps.filter(s=>s.status==='add').map(s=>s.widget);if(existing.length+additions.length>24)throw new Error('These cards would exceed the 24-card Dashboard limit. Existing cards are kept.');
  return {steps,additions,widgets:[...existing,...additions]};
}
export function experimentPreview(template,blueprint,device,channels,projectId,existing){
  const streams=templateChannelPlan(template,device,channels,projectId);if(streams.some(s=>s.status==='conflict'))throw new Error('A stream key has a different type or unit. Existing streams are kept; review the template or choose another device.');
  const preview=streams.map(s=>s.existing||{...s.definition,id:crypto.randomUUID(),device_id:device.id});
  const primary=preview.find(c=>c.channel_key===template.channels[0].channel_key);
  return {streams,...missingExperimentWidgets(blueprint,device,[...channels,...preview.filter(p=>!channels.some(c=>c.id===p.id))],projectId,primary.id,existing)};
}
