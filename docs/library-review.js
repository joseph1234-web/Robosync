import { PHONE_REVIEW_FIXTURE } from './phone-review-fixture.js?v=0.36.1';
import { createDashboard } from './dashboard.js?v=0.37.0';
// Uses the actual main dashboard DOM and controller, with memory-only fixtures.
// It never imports auth/app startup, reads owner storage, or calls a backend.
const template=new DOMParser().parseFromString(await(await fetch('./index.html')).text(),'text/html');
for(const script of template.querySelectorAll('script'))script.remove();
document.body.replaceChildren(...[...template.body.childNodes].map(n=>document.importNode(n,true)));
const $=id=>document.getElementById(id),id=n=>'55555555-5555-4555-8555-'+String(n).padStart(12,'0');
let project={id:id(1),name:'Synthetic sensor workspace'},devices=[{id:id(2),project_id:project.id,label:'ESP32 Lab',board_model:'esp32-devkit-v1',config:{mode:'simulation'}},{id:id(3),project_id:project.id,label:'Arduino Lab',board_model:'arduino-uno-r3',config:{mode:'simulation'}}];
let channels=[{id:id(4),device_id:id(2),title:'Potentiometer',channel_key:'pot_raw',value_type:'number',direction:'input',unit:'raw',config:{virtual_pin:'V0',physical_pin:'GPIO34',min:0,max:4095}},{id:id(5),device_id:id(2),title:'LED / relay',channel_key:'led_out',value_type:'boolean',direction:'output',unit:'',config:{virtual_pin:'V8',physical_pin:'GPIO25',io:{version:1,kind:'output',type:'boolean',driver:'digital',operations:['set']}}},{id:id(6),device_id:id(3),title:'Light',channel_key:'light_raw',value_type:'number',direction:'input',unit:'raw',config:{virtual_pin:'V1',physical_pin:'A0',min:0,max:1023}}];
const phoneReview=new URLSearchParams(location.search).get('phone')==='1';let record=null;if(phoneReview){const f=structuredClone(PHONE_REVIEW_FIXTURE);project=f.project;devices=f.devices;channels=f.channels;record={id:project.id,project_id:project.id,widget_type:'note',revision:1,config:f.config};}
const request=async(path,options={})=>{const u=new URL(path,location.origin);if(u.pathname==='/rest/v1/channels')return structuredClone(channels);if(u.pathname==='/rest/v1/telemetry')return[{id:id(10),channel_id:u.searchParams.get('channel_id')?.slice(3),value_num:2387,quality:'estimated',recorded_at:new Date().toISOString()}];if(u.pathname==='/rest/v1/widgets'){if(options.method==='POST')record=structuredClone(options.body);else if(options.method==='PATCH'){if(record?.revision===Number(u.searchParams.get('revision')?.slice(3)))record={...record,...structuredClone(options.body)};}return record?[structuredClone(record)]:[];}if(u.pathname==='/rest/v1/rpc/rs_io_device_status')return{capabilities:null,last_boot:null};throw Error('Software preview only: no backend requests or output execution.');};
for(const name of ['login-screen','workspace-overview','project-data-view','rules-view','analytics-view','experiments-view'])if($(name))$(name).hidden=true;
for(const name of ['workspace-screen','project-workspace','dashboard-view'])$(name).hidden=false;
$('project-workspace-title').textContent=project.name;$('project-workspace-description').textContent='Synthetic review only · ESP32 V0/GPIO34 and Arduino V1/A0';
for(const node of document.querySelectorAll('.project-tabs,.project-actions,.topbar,.sidebar,.studio-entry'))node.hidden=true;
const shell=document.querySelector('.workspace');shell.style.gridTemplateColumns='1fr';
const notice=document.createElement('div');notice.className='notice';notice.textContent='SOFTWARE REVIEW · Synthetic data and pin plans. Saves stay in this page. Controls are inactive; no owner, cloud or board connection.';notice.style.margin='0';notice.style.position='sticky';notice.style.top='0';notice.style.zIndex='20';notice.style.borderRadius='0';document.body.prepend(notice);
for(const node of document.querySelectorAll('[data-close]'))node.addEventListener('click',()=>$(node.dataset.close)?.close());
const dashboard=createDashboard({request,friendlyError:(e,f)=>e.message||f,getSession:()=>({user:{id:'synthetic-review'}}),getGeneration:()=>1});
await dashboard.open(project,devices);$('dashboard-auto-refresh').checked=false;if(phoneReview){$('project-workspace-description').textContent='Shared software fixture · mixed heights, one hidden card and custom phone order';$('dashboard-phone-preview').click();}else $('dashboard-edit').click();
$(phoneReview?'dashboard-phone-controls':'widget-palette-panel').scrollIntoView({block:'start'});
