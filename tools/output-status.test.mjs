import test from 'node:test';
import assert from 'node:assert/strict';
import { commandPresentation, commandMatches, reportedDelivery, controlReadiness } from '../docs/control-state.js';
import { createCommandClient } from '../docs/io-widgets.js';

const device = {id:'22222222-2222-4222-8222-222222222222',board_model:'esp32-devkit-v1'};
const boot = '0123456789abcdef';
const command = {id:'44444444-4444-4444-8444-444444444444',device_id:device.id,channel_id:'33333333-3333-4333-8333-333333333333',boot,state:'accepted'};
const report = {version:1,device_id:device.id,last_boot:boot,reported:{control_contact:new Date().toISOString(),outputs:[{pin:13,command:command.id}]}};

test('acceptance and sensor contact alone cannot confirm delivery', () => {
  assert.equal(commandPresentation(command, false).code,'accepted');
  assert.equal(reportedDelivery(command, {...report,reported:{outputs:report.reported.outputs}},13),false);
  assert.equal(reportedDelivery(command, {...report,last_boot:'aabbccddeeff0011'},13),false);
  assert.equal(reportedDelivery(command, report,14),false);
  assert.equal(commandPresentation(command,reportedDelivery(command,report,13)).code,'sent');
  assert.equal(controlReadiness({type:'switch'},{direction:'output'},device,null).ready,false);
});
test('every ACK matches command, channel, device and boot', () => {
  const expected = {id:command.id,device:device.id,channel:command.channel_id,boot};
  assert.ok(commandMatches(command,expected));
  for(const key of ['id','device_id','channel_id','boot']) assert.equal(commandMatches({...command,[key]:'other'},expected),false);
  assert.equal(commandMatches(null,expected),false);
});
test('late application remains expired and an unknown response stays unconfirmed', () => {
  assert.equal(commandPresentation({...command,state:'expired',result:{state:'applied'}},true).code,'expired');
  assert.equal(commandPresentation({...command,state:'rejected'},true).code,'rejected');
  assert.equal(commandPresentation(null,true).code,'unconfirmed');
  assert.equal(commandPresentation({...command,state:'applied',result:{phase:'value_applied'}},false).code,'applied');
});
test('retry uses the same identity, controller and original deadline', async () => {
  const writes=[];let clock=10000;let ids=0;
  const client=createCommandClient({uuid:()=>String(++ids),canUse:()=>true,now:()=>clock,wait:async ms=>{clock+=ms;},rpc:async (name,body)=>{
    writes.push({...body});if(writes.length===1)throw new TypeError('network');return {id:body.p_id};
  }});
  await client.send('channel',boot,'set',true);
  assert.equal(writes.length,2);
  assert.deepEqual(writes[0],writes[1]);
  assert.equal(Date.parse(writes[0].p_deadline),18000);
  assert.equal(client.pending(),0);
});
test('an elapsed deadline never causes a new send', async () => {
  let clock=10000,writes=0;const client=createCommandClient({uuid:()=>String(Math.random()),canUse:()=>true,now:()=>clock,wait:async()=>{clock+=9000;},rpc:async()=>{writes++;throw new TypeError('network');}});
  await assert.rejects(client.send('channel',boot,'set',false));assert.equal(writes,1);
});

test('control readiness requires authenticated control contact, regardless of a new telemetry upload', () => {
  const channel={
    id:command.channel_id,device_id:device.id,channel_key:'relay',title:'Relay',value_type:'boolean',direction:'output',
    config:{physical_pin:'GPIO13',virtual_pin:'V6',io:{version:1,kind:'output',type:'boolean',driver:'digital',operations:['set']}}
  };
  const now=Date.now(),sensorsOnly={
    ...report,last_contact:new Date(now).toISOString(),last_upload:new Date(now).toISOString(),
    reported:{upload:{previous_http_code:200}},
    capabilities:{kind:'robosynct-io',version:1,board:device.board_model,virtual_pin_max:254,operations:['set'],
      outputs:[{pin:13,driver:'digital',operations:['set']}]}
  };
  assert.equal(controlReadiness({type:'switch'},channel,device,sensorsOnly,{now}).code,'stale');
  const online={...sensorsOnly,reported:{...sensorsOnly.reported,control_contact:new Date(now).toISOString()}};
  assert.equal(controlReadiness({type:'switch'},channel,device,online,{now}).code,'ready');
});
