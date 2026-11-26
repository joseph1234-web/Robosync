import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraMediaId,hardwareStreamPlan,hardwareWidget,motorStreamProfile,provisionHardware } from '../docs/hardware-streams.js';
import { compatibleWidget } from '../docs/io-widgets.js';

const device={id:'72700000-0000-4000-8000-000000000001',board_model:'esp32-devkit-v1',config:{mode:'hardware'}};
const camera={id:'72700000-0000-4000-8000-000000000002',board_model:'esp32-cam-ai-thinker',config:{mode:'hardware'}};
const saved=row=>({...row,id:crypto.randomUUID()});

test('both H-bridges create read-only signals, skip used virtual labels and keep existing IDs',()=>{
  for(const driver of ['L298N','L293D']){
    const existing=saved({device_id:device.id,channel_key:'temperature',config:{physical_pin:'GPIO4',virtual_pin:'V21'}});
    const plan=hardwareStreamPlan(driver,device,[existing]).map(step=>saved(step.row));
    assert.deepEqual(plan.map(row=>row.config.virtual_pin),['V20','V22','V23','V24','V25','V26']);
    assert.deepEqual(plan.map(row=>row.config.physical_pin),['GPIO25','GPIO27','GPIO32','GPIO33','GPIO23','GPIO26']);
    assert.deepEqual(plan.map(row=>row.value_type),['number','boolean','boolean','boolean','boolean','number']);
    assert.ok(plan.every(row=>row.direction==='input'&&!row.config.io.operations&&motorStreamProfile(row,device)===driver));
    assert.ok(hardwareStreamPlan(driver,device,[...plan,existing]).every(({row,create},i)=>!create&&row.id===plan[i].id));
    const widget=hardwareWidget(driver,device,plan);
    assert.equal(widget.channel_id,plan[1].id);
    assert.equal(widget.phone.span,12);
    assert.ok(compatibleWidget(widget.type,plan[1],device));
    assert.equal(compatibleWidget('switch',plan[1],device),false);
  }
});

test('an incompatible existing motor mapping or secondary RGB pin stops setup',()=>{
  const rgb=saved({device_id:device.id,channel_key:'rgb',config:{physical_pin:'GPIO22',io:{rgb_pins:[22,25,21]}}});
  assert.throws(()=>hardwareStreamPlan('L298N',device,[rgb]),/GPIO is already mapped/);
  const retained=hardwareStreamPlan('L293D',device,[]).map(step=>saved(step.row));
  assert.throws(()=>hardwareStreamPlan('L298N',device,retained),/different motor stream mapping/);
  assert.throws(()=>hardwareStreamPlan('L298N',camera,[]),/matching hardware device/);
});

test('camera setup reuses the existing private media UUID and camera stream',()=>{
  const row=saved(hardwareStreamPlan('camera',camera,[])[0].row);
  assert.equal(row.value_type,'text');
  assert.equal(row.direction,'input');
  const previous={...row,channel_key:'cam_main'};
  const plan=hardwareStreamPlan('camera',camera,[previous]);
  assert.equal(plan[0].create,false);
  const widget=hardwareWidget('camera',camera,[plan[0].row]);
  assert.equal(widget.mode,'protected');
  assert.equal(widget.media_id,cameraMediaId(previous,camera));
  assert.equal(widget.channel_id,previous.id);
  assert.ok(compatibleWidget('camera',previous,camera));
});

test('an ambiguous save reply reuses the committed row and a scope change stops remaining writes',async()=>{
  const rows=[];
  let writes=0,active=true;
  const save=async job=>{
    assert.equal(job.p_parent,device.id);
    assert.equal(job.p_kind,'stream');
    const row={...job.p_payload,id:job.p_id,device_id:job.p_parent};
    rows.push(row);
    if(++writes===1)throw Error('Connection lost after commit');
    if(writes===2)active=false;
    return row;
  };
  const options={profile:'L298N',device,load:async()=>[...rows],current:()=>active,write:save};
  await assert.rejects(provisionHardware(options),/Account or project changed/);
  assert.equal(writes,2);
  active=true;
  const result=await provisionHardware(options);
  assert.equal(writes,6);
  assert.deepEqual(result.streams.map(row=>row.id),rows.map(row=>row.id));
});
