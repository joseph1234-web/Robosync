import { renderOutputControl } from './output-control-view.js?v=3.0.1';
import { PHONE_LAYOUT_SPEC } from './phone-layout-spec.js?v=0.36.1';
import { WIDGET_CONTRACT } from './widget-contract.js?v=0.36.1';
import { streamDescriptor, negotiateStreamCapabilities, validateControlValue } from './stream-contract.js?v=0.36.1';
export const CONTROL_TYPES=Object.entries(WIDGET_CONTRACT.widgets).filter(([,r])=>r.direction==='output').map(([k])=>k);
export const SPECIAL_TYPES=['multi','bar','timeline','counter','tank','health','alarm','vector','compass','gps','heatmap'];
export const COMPLEX_TYPES=['chart','table','camera','multi','bar','timeline','heatmap','apply','thermostat','schedule','console'];
export function phoneColumns(w,width=390,scale=1,custom=false){if(w.type==='panel'||w.type==='slider'&&w.behavior?.version===1&&w.behavior.variant==='range'||w.type==='entry'&&w.behavior?.version===1&&w.behavior.variant==='multiline'||w.type==='health'&&w.behavior?.version===1&&w.behavior.variant==='device'||w.type==='alarm'&&w.behavior?.version===1&&w.behavior.variant==='events')return PHONE_LAYOUT_SPEC.fullSpan;const rules=PHONE_LAYOUT_SPEC,span=custom?w.phone?.span:0,compact=rules.compactTypes.includes(w.type)&&(custom?(w.phone?.compact??w.compact):w.compact);if(width<rules.collapseBelow||scale>=rules.largeTextScale||span===rules.fullSpan)return rules.fullSpan;if(span===rules.standardSpan)return rules.standardSpan;if(rules.complexTypes.includes(w.type))return rules.fullSpan;return compact&&width>=rules.compactMinWidth&&scale<=rules.compactMaxTextScale?rules.compactSpan:rules.standardSpan;}
export function compatibleWidget(type,c,device,cap=null){try{const d=streamDescriptor(c,device,{capabilities:cap}),rule=WIDGET_CONTRACT.widgets[type];return !!rule&&!(c.config?.io?.driver==='thermostat'&&type!=='thermostat')&&rule.direction===d.direction&&rule.types.includes(d.type)&&(!rule.drivers||rule.drivers.includes(c.config?.io?.driver))&&(type!=='compass'||['deg','°'].includes(d.unit));}catch{return false;}}
export function createCommandClient({rpc,canUse,now=Date.now,uuid=()=>crypto.randomUUID(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  let controller=uuid(),generation=0,issued=false,submitting=false;
  const pending=new Map();

  async function submit(name,args,operation='set'){
    if(!canUse())throw Error('Owner sign-in and internet are required.');
    if(submitting)throw Error('Wait for cloud acceptance before sending another value.');
    const context=generation,id=uuid(),until=now()+(operation==='press'?1200:operation==='pulse'?2000:8000);
    const deadline=new Date(until).toISOString();
    const request={p_id:id,p_controller:controller,p_boot:args.p_boot,p_deadline:deadline};
    const body=name==='rs_command_request'
      ?{...request,p_channel:args.p_channel,p_operation:args.p_operation,p_value:args.p_value}
      :{...request,p_items:args.p_items};
    const attempted=(body.p_items||[{id,channel:args.p_channel}]).map(item=>({id:item.id,channel_id:item.channel,deadline}));
    const current=()=>context===generation&&canUse();
    let uncertain=false;
    submitting=true;pending.set(id,body);
    try{
      for(let attempt=0;attempt<3&&current()&&now()<until;attempt++){
        try{
          issued=true;
          const result=await rpc(name,body,{timeoutMs:Math.max(1,until-now())});
          if(!current())throw Error('Command context changed.');
          return result;
        }catch(error){
          const transport=(!error.status&&['AbortError','TypeError'].includes(error.name))||error.status>=500;
          uncertain||=transport;
          const retry=transport||error.status===429;
          if(!retry||attempt===2||!current()||now()>=until){
            if(uncertain)error.attempted=attempted;
            throw error;
          }
          await wait(200*2**attempt);
        }
      }
      const error=Error('Command deadline passed while waiting for cloud acceptance.');
      if(uncertain)error.attempted=attempted;
      throw error;
    }finally{
      pending.delete(id);
      submitting=false;
    }
  }

  return {
    send:(channel,boot,operation,value)=>submit('rs_command_request',{p_channel:channel,p_boot:boot,p_operation:operation,p_value:value},operation),
    sendBatch:(items,boot)=>submit('rs_command_batch',{p_boot:boot,p_items:items.map(item=>({id:uuid(),channel:item.channel,value:item.value}))}),
    status:id=>rpc('rs_command_status',{p_command:id},{timeoutMs:2500}),
    stop:()=>{
      generation++;pending.clear();
      const ending=controller;
      controller=uuid();
      const cancel=issued&&canUse();
      issued=false;
      if(cancel)Promise.resolve(rpc('rs_command_cancel',{p_controller:ending})).catch(()=>{});
    },
    pending:()=>pending.size
  };
}
export { renderOutputControl };
