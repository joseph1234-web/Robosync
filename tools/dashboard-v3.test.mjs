import assert from 'node:assert/strict';
import test from 'node:test';
import { WIDGET_LIBRARY_GROUPS, widgetLibraryInventory, filterWidgetLibrary, widgetSupportsStream } from '../docs/widget-library.js';
import { dashboardTabs, setDashboardTabs } from '../docs/widget-behavior.js';
import { readingDelivery } from '../docs/reading-delivery.js';
import { analyticsReadingsCsv, summarizeAnalytics } from '../docs/analytics-math.js';

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const device={id:id(1),project_id:id(2),label:'ESP32 Lab',board_model:'ESP32 DevKit V1'};
const temperature={id:id(3),device_id:device.id,channel_key:'temperature',title:'Temperature',unit:'°C',direction:'input',value_type:'number',config:{virtual_pin:'V1'}};
const relay={id:id(4),device_id:device.id,channel_key:'relay',title:'Relay',unit:'',direction:'output',value_type:'boolean',config:{virtual_pin:'V6',physical_pin:'GPIO13',io:{version:1,kind:'output',type:'boolean',driver:'digital',operations:['set']}}};

test('library looks up a compatible input by virtual pin, name, and type',()=>{
  const index=widgetLibraryInventory([temperature,relay],[device],{projectId:device.project_id});
  assert.deepEqual(WIDGET_LIBRARY_GROUPS,['All','Sensors','Controls','Charts','Media','Advanced','Layout']);
  assert(filterWidgetLibrary(index,'Charts','V1').some(i=>i.type==='chart'));
  assert(filterWidgetLibrary(index,'Sensors','temperature').some(i=>i.type==='value'&&i.sources[0].id===temperature.id));
  assert(filterWidgetLibrary(index,'Controls','V6').some(i=>i.type==='switch'));
  assert(!filterWidgetLibrary(index,'Controls','V1').length);
  assert(!widgetLibraryInventory([temperature,relay],[device],{projectId:id(99)}).some(i=>i.sources.length));
});
test('relay with set only never appears as a writable pulse or hold source',()=>{
  assert.equal(widgetSupportsStream('switch',relay,device),true);
  assert.equal(widgetSupportsStream('pulse',relay,device),false);
  assert.equal(widgetSupportsStream('momentary',relay,device),false);
  assert.equal(widgetSupportsStream('switch',temperature,device),false);
});
test('old samples uploaded now retain historical status; receipt time can be missing',()=>{
  const now=Date.parse('2026-11-24T10:00:00Z');
  const earlier='2026-11-24T09:55:00Z',received='2026-11-24T10:00:00Z';
  assert.deepEqual(readingDelivery([{recorded_at:earlier,received_at:received,value_num:29}],now),{at:Date.parse(earlier),age:'5m ago',delay:'5m',recent:false});
  assert.equal(readingDelivery([{recorded_at:received,value_num:0}],now).delay,null);
  assert.equal(readingDelivery([{recorded_at:received,value_num:0}],now).recent,true);
  assert.equal(readingDelivery([{recorded_at:received,value_num:0,quality:'bad'}],now),null);
  assert.equal(readingDelivery([{recorded_at:'2026-11-25T00:00:00Z',value_num:0}],now),null);
});
test('named and legacy sections retain widgets and phone settings through reorder',()=>{
  const source={navigation:{version:1,tabs:[{id:'s',key:'s',label:'Sensors'},{id:'e',key:'e',label:'Empty'}]},widgets:[{id:'w',tab:'Weather',phone:{span:6}},{id:'w2',tab:'s'}]};
  const tabs=dashboardTabs(source); assert.deepEqual(tabs.map(t=>t.label),['Sensors','Empty','Weather']);
  const reordered=setDashboardTabs(source,[tabs[2],tabs[1],tabs[0]]);
  assert.deepEqual(dashboardTabs(reordered).map(t=>t.label),['Weather','Empty','Sensors']);
  assert.deepEqual(reordered.widgets,source.widgets);
  assert.equal(setDashboardTabs(source,[tabs[1],tabs[0]]).widgets[0].tab,'');
  assert.equal(source.widgets[0].tab,'Weather');
});
test('analytics statistics and exports keep capture and receipt timestamps distinct',()=>{
  const rows=[{id:'a',recorded_at:'2026-11-24T09:00:00Z',received_at:'2026-11-24T10:00:00Z',value_num:0,quality:'ok'},{id:'b',recorded_at:'2026-11-24T09:01:00Z',received_at:'2026-11-24T10:00:01Z',value_num:30,quality:'ok'}];
  const stats=summarizeAnalytics(rows); assert.deepEqual([stats.min,stats.mean,stats.max],[0,15,30]);
  const csv=analyticsReadingsCsv([{source:{device,channel:temperature},rows}]); assert.match(csv,/"recorded_at_utc","received_at_utc"/); assert.ok(csv.includes('"2026-11-24T09:00:00Z","2026-11-24T10:00:00Z"'));
});
