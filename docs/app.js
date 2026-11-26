import { createQuickstart } from './quickstart.js?v=0.36.1';
import { createConnectionGuide } from './connect-guide.js?v=3.0.0';
import { createPhaseFour } from './phase4.js?v=3.0.0';
import { SUPABASE_URL, PUBLISHABLE_KEY } from './public-config.js?v=0.36.1';
import { createPairing } from './pairing.js?v=3.0.0';
import { createThemes } from './themes.js?v=0.36.1';
import { createAuthAccess } from './auth-access.js?v=0.36.1';
import { createDeletion } from './deletion.js?v=0.36.1';
import { createLab } from './lab.js?v=3.0.2';
import { createOverview } from './workspace-overview.js?v=3.0.0';
// Public project configuration. Elevated keys and passwords do not belong here.
const SESSION_KEY = 'robosynct.session.v1';
const $ = id => document.getElementById(id);
let session = null;
let projects = [];
let refreshPromise = null;
let loadingProjects = false;
let projectsLoadVersion=0;
let savingProject = false;
let selectedProjectId = '';
let authGeneration = 0;
let preferredProjectId = '', projectView = 'overview', navigation = 0, projectLoad = null;

class ApiError extends Error {
  constructor(message, status, code) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
}
function show(el, visible = true) { el.hidden = !visible; }
function message(id, text) { const el=$(id); el.textContent=text; show(el, !!text); }
function busy(button, value, label) { button.disabled=value; button.textContent=label; }
function storeSession(next) {
  session=next;
  try { if(next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); else sessionStorage.removeItem(SESSION_KEY); } catch { /* The session still works in memory. */ }
}
function clearState() {
  authGeneration++;navigation++;projectLoad=null;
  quickstart.reset();connectionGuide.reset();phaseFour.reset();pairing.reset();lab.reset(false);deletion.reset();auth.reset();projectsLoadVersion++;loadingProjects=false;
  for(const id of ['detail-title','detail-description','detail-created','detail-id']) $(id).textContent='';
  storeSession(null); projects=[]; selectedProjectId='';preferredProjectId='';overview.reset();
  dispatchEvent(new CustomEvent('robosynct:project-view',{detail:'overview'}));
  renderProjectSelector(); $('project-search').value='';
  $('project-search-summary').textContent='';show($('project-no-matches'),false);
  $('workspace-setup-check').textContent='1';$('workspace-setup-check').classList.toggle('pending',true);$('workspace-setup-text').textContent='Use Refresh to check this account can load its project list.';
  $('project-grid').replaceChildren(); $('account-email').textContent='';
  for(const el of document.querySelectorAll('dialog[open]')) el.close();
  show($('workspace-screen'), false); show($('login-screen'));
  $('password').value='';
  message('workspace-message',''); message('workspace-error','');
}
function safeApiMessage(value) {
  // Display the error message, never the response details or request credentials.
  return String(value || '').replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,'[redacted key]')
    .replace(/Bearer\s+[^\s,;]+/gi,'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted token]')
    .replace(/[\r\n]+/g,' ').slice(0,300);
}
function friendlyError(err, context='') {
  if(!navigator.onLine) return 'You’re offline. Reconnect and try again.';
  const code=String(err.code||'').replace(/[^A-Za-z0-9_]/g,'').slice(0,40);
  const reference=code?' ('+code+')':'';
  if(err.status===401 || code==='invalid_credentials' || /invalid login credentials/i.test(err.message)) return 'The email or password wasn’t recognized. Check both and try again.';
  if(code==='email_not_confirmed') return 'Your email is not confirmed. Use the confirmation link in your email, then sign in again.';
  if(err.status===429) return 'Too many attempts. Wait a little, then try again.';
  if(err.status===403 || code==='42501') return 'This account does not have access to these records. Check the starter table permissions and policies.'+reference;
  if(code==='PGRST205' || code==='42P01') return 'A workspace table could not be found. Check the configured project and ask the maintainer to review its schema before changing existing data.'+reference;
  if(code==='PGRST204' || code==='42703') return 'The database table structure does not match this app.'+reference+' '+safeApiMessage(err.message);
  if(code==='23514' || code==='23502') return 'The database rejected these settings.'+reference+' '+safeApiMessage(err.message);
  if(code==='23503') return 'The linked project, device, or stream could not be found. Refresh and open your project again.'+reference+' '+safeApiMessage(err.message);
  if(code==='23505') return 'A matching record already exists. Refresh the list before adding it again.'+reference;
  if(code==='DEVICE_READBACK_EMPTY') return 'The save request finished, but no device could be read back for this project. Check the device SELECT policy; do not remove Row Level Security. (DEVICE_READBACK_EMPTY)';
  if(err.name==='AbortError') return 'The connection took too long. Check your network, then try again.';
  if(err instanceof TypeError) return 'Couldn’t reach Supabase. Check your connection and try again.';
  if(err.status) return (context||'The database request failed.')+' Supabase returned HTTP '+err.status+reference+'. '+safeApiMessage(err.message);
  return context || 'Something went wrong. Please try again.';
}
async function request(path, {method='GET', body, authenticated=false, retry=true, prefer, timeoutMs=20000}={}) {
  const requestGeneration=authGeneration, deadline=Date.now()+timeoutMs;
  if(authenticated && !session) throw new ApiError('Not signed in',401);
  if(authenticated && session.expires_at && session.expires_at*1000 < Date.now()+30000) await refreshSession();
  if(authenticated&&(!session||requestGeneration!==authGeneration))throw new ApiError('Session changed',401);
  if(Date.now()>=deadline)throw new DOMException('Request time elapsed','AbortError');
  const headers={'apikey':PUBLISHABLE_KEY,'Accept':'application/json'};
  if(body!==undefined) headers['Content-Type']='application/json';
  if(authenticated) headers.Authorization=`Bearer ${session.access_token}`;
  if(prefer) headers.Prefer=prefer;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(1,deadline-Date.now()));
  let response, data;
  try {
    response=await fetch(`${SUPABASE_URL}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
    const text=await response.text();
    try { data=text?JSON.parse(text):null; } catch { data=null; }
  } finally { clearTimeout(timer); }
  if(!response.ok) {
    if(response.status===401&&authenticated&&retry&&session?.refresh_token&&requestGeneration===authGeneration) {
      await refreshSession();
      if(requestGeneration!==authGeneration)throw new ApiError('Session changed',401);
      return request(path,{method,body,authenticated,retry:false,prefer,timeoutMs:deadline-Date.now()});
    }
    throw new ApiError(data?.msg || data?.error_description || data?.message || 'Request failed',response.status,data?.error_code || data?.code);
  }
  return data;
}
async function refreshSession() {
  if(refreshPromise) return refreshPromise;
  const generation=authGeneration;
  const token=session?.refresh_token;
  if(!token) { clearState(); throw new ApiError('Session expired',401); }
  refreshPromise=(async()=>{
    try {
      const next=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:token}});
      if(generation!==authGeneration) throw new ApiError('Session changed',401);
      storeSession(next);
    } catch(err) {
      if(generation===authGeneration && (err.status===400 || err.status===401 || err.status===403)) {
        clearState(); message('login-error','Your session ended. Please sign in again.');
      }
      throw err;
    } finally { refreshPromise=null; }
  })();
  return refreshPromise;
}
async function checkConnection() {
  $('connection-label').textContent='Checking connection…'; $('connection-dot').className='status-dot neutral'; show($('retry-connection'),false);
  try {
    const settings=await request('/auth/v1/settings');
    auth.setSettings(settings);const enabled=settings?.external?.email;
    $('connection-label').textContent=enabled?'Supabase connected · Email login ready':'Supabase connected · Enable email login';
    $('connection-dot').className=enabled?'status-dot':'status-dot error';
  } catch {
    $('connection-label').textContent='Connection unavailable'; $('connection-dot').className='status-dot error'; show($('retry-connection'));
  }
}
async function ensureProfile(user, generation) {
  const profiles=await request('/rest/v1/profiles?select=id&limit=1',{authenticated:true});
  if(generation!==authGeneration) return;
  if(!profiles.length) {
    try { await request('/rest/v1/profiles',{method:'POST',authenticated:true,body:{id:user.id,display_name:String(user.user_metadata?.display_name||user.user_metadata?.full_name||'RoboSynct learner').slice(0,120)}}); }
    catch(err) { if(err.code!=='23505') throw err; }
  }
}
function formatDate(value) {
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Saved to your workspace':date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
}
function renderProjects() {
  const last=recentProjects().find(p=>p.id===resumeId());
  $('resume-project').disabled=!last;
  overview.dashboards(recentProjects());
  $('project-grid').replaceChildren();
  $('project-count').textContent=String(projects.length);
  $('project-count-small').textContent=String(projects.length);
  $('progress-label').textContent=projects.length?'Projects you can open':'Create your first project';
  $('project-setup-check').textContent=projects.length?'✓':'3';
  $('project-setup-check').classList.toggle('pending',!projects.length);
  $('project-setup-text').textContent=projects.length?'Your project is saved in Supabase.':'Give your experiment a name to complete this step.';
  show($('empty-projects'),projects.length===0);
  const query=$('project-search').value.trim().toLocaleLowerCase();
  const visible=projects.filter(project=>!query||[project.name,project.description,project.id].join(' ').toLocaleLowerCase().includes(query));
  $('project-search-summary').textContent=visible.length+' of '+projects.length+' projects';
  show($('project-no-matches'),projects.length>0&&visible.length===0);
  for(const project of visible) {
    const article=document.createElement('article'); article.className='project-card';
    const top=document.createElement('div'); top.className='project-card-top';
    const icon=document.createElement('div'); icon.className='project-emoji'; icon.textContent='▧'; icon.setAttribute('aria-hidden','true');
    top.append(icon);
    const h=document.createElement('h3'); h.textContent=project.name;
    const p=document.createElement('p'); p.textContent=project.description || ''; p.hidden=!project.description;
    const foot=document.createElement('div'); foot.className='project-card-footer';
    const date=document.createElement('span'); date.textContent=formatDate(project.created_at);
    const open=document.createElement('button'); open.type='button'; open.className='text-button'; open.textContent='Open project';
    open.addEventListener('click',()=>openProject(project)); foot.append(date,open);const remove=document.createElement('button');remove.type='button';remove.className='project-delete-icon';remove.textContent='Delete';remove.setAttribute('aria-label','Delete project '+project.name);remove.addEventListener('click',()=>deleteProject(project));foot.append(remove); article.append(top,h,p,foot); $('project-grid').append(article);
  }
}
function openProject(project,fromStarter=false) {
  if(deletion.isBusy()||quickstart.isBusy()&&!fromStarter||!lab.canLeave())return;
  selectedProjectId=preferredProjectId=project.id;rememberProject(project.id);
  renderProjectSelector();overview.stop();
  $('detail-title').textContent=project.name;
  $('detail-description').textContent=project.description || 'No description yet.';
  $('detail-created').textContent=formatDate(project.created_at);
  $('detail-id').textContent=project.id;
  $('copy-project-id').textContent='Copy project ID';
  const load=lab.open(project);
  projectLoad=load;
  load.finally(()=>{if(projectLoad===load)projectLoad=null;}).catch(()=>{});
  return load;
}
async function loadProjects() {
  if(loadingProjects || !session) return;
  loadingProjects=true;
  const generation=authGeneration,load=++projectsLoadVersion;
  show($('projects-loading')); show($('empty-projects'),false); $('refresh-button').disabled=true;
  try {
    const rows=await request('/rest/v1/projects?select=id,owner_id,name,description,created_at&order=created_at.desc',{authenticated:true});
    if(generation!==authGeneration||load!==projectsLoadVersion) return;
    if(!Array.isArray(rows)) throw new Error('Unexpected project response');
    projects=rows; prepareOverview(); renderProjects(); message('workspace-error','');
    $('workspace-connection').textContent='Cloud connected';$('workspace-connection').dataset.health='online';
    $('workspace-setup-check').textContent='✓';$('workspace-setup-check').classList.toggle('pending',false);
    $('workspace-setup-text').textContent='Your project list was loaded for this account.';
  } catch(err) {
    if(generation===authGeneration&&load===projectsLoadVersion) { message('workspace-error',friendlyError(err,'Couldn’t load your projects. Use Refresh to try again.')); $('workspace-connection').textContent='Cloud unavailable';$('workspace-connection').dataset.health='offline'; $('workspace-setup-check').textContent='1';$('workspace-setup-check').classList.toggle('pending',true);$('workspace-setup-text').textContent='Project access could not be checked. Reconnect and use Refresh.'; }
  } finally {
    if(generation===authGeneration&&load===projectsLoadVersion){loadingProjects=false;show($('projects-loading'),false);$('refresh-button').disabled=false;}
  }
}
async function openWorkspace() {
  if(!session?.user) throw new ApiError('Session missing',401);
  const generation=authGeneration;
  $('account-email').textContent=session.user.email || session.user.phone || '';
  $('account-avatar').textContent=(session.user.email || session.user.phone || 'R').slice(0,1).toUpperCase();
  show($('login-screen'),false); show($('workspace-screen'));
  await loadProjects();
  const target=new URLSearchParams(location.search),requested=target.get('project');if(generation===authGeneration&&requested&&target.get('editor')==='phone'){const owned=projects.find(p=>p.id===requested);if(owned){await openProject(owned);if(generation===authGeneration)await lab.openPhoneEditor();}else message('workspace-error','This project is unavailable to the signed-in account.');}
  try { await ensureProfile(session.user,generation); }
  catch(err) { if(generation===authGeneration) message('workspace-error',friendlyError(err,'Your account is signed in, but its learner profile could not be saved. Check the profiles table policy.')); }
}
function newProject() {
  if(deletion.isBusy())return;
  $('project-form').reset(); message('project-error','');
  busy($('save-project-button'),false,'Create project'); $('project-dialog').showModal(); $('project-name').focus();
}
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault(); if($('signin-button').disabled||auth.isBusy()) return;
  message('login-error',''); busy($('signin-button'),true,'Signing in…');
  const email=$('email').value.trim(); const password=$('password').value;
  try {
    const next=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
    if(!next?.access_token || !next?.user?.id) throw new Error('Incomplete login response');
    await acceptSession(next);
  } catch(err) { message('login-error',friendlyError(err,'Couldn’t sign in. Check your account and connection, then try again.')); }
  finally { busy($('signin-button'),false,'Sign in to RoboSynct'); }
});
$('toggle-password').addEventListener('click',()=>{
  const visible=$('password').type==='password'; $('password').type=visible?'text':'password';
  $('toggle-password').textContent=visible?'Hide':'Show'; $('toggle-password').setAttribute('aria-label',visible?'Hide password':'Show password'); $('toggle-password').setAttribute('aria-pressed',String(visible));
});
$('signout-button').addEventListener('click',()=>{
  if(deletion.isBusy()||auth.isBusy()||quickstart.isBusy()||!lab.canLeave())return;
  const token=session?.access_token; clearState(); $('email').focus();
  if(token) {
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),10000);
    fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${token}`},signal:controller.signal}).catch(()=>{}).finally(()=>clearTimeout(timer));
  }
});
for(const id of ['new-project-button','empty-create-button']) $(id).addEventListener('click',newProject);
$('refresh-button').addEventListener('click',loadProjects);
$('project-search').addEventListener('input',renderProjects);
$('clear-project-search').addEventListener('click',()=>{$('project-search').value='';renderProjects();$('project-search').focus();});
$('retry-connection').addEventListener('click',checkConnection);
for(const id of ['setup-button','mobile-setup-button']) $(id).addEventListener('click',()=>$('setup-dialog').showModal());
for(const button of document.querySelectorAll('[data-close]')) button.addEventListener('click',()=>{
  if((button.dataset.close==='project-dialog' && savingProject) || quickstart.blocksClose(button.dataset.close)||lab.blocksClose(button.dataset.close)||deletion.blocksClose(button.dataset.close)||auth.blocksClose(button.dataset.close)) return;
  $(button.dataset.close).close();
});
$('project-dialog').addEventListener('cancel',event=>{if(savingProject)event.preventDefault();});
$('project-form').addEventListener('submit',async event=>{
  event.preventDefault(); if(savingProject || !session) return;
  const name=$('project-name').value.trim(), description=$('project-description').value.trim();
  if(!name) { message('project-error','Give your project a name first.'); $('project-name').focus(); return; }
  savingProject=true; const generation=authGeneration;
  busy($('save-project-button'),true,'Creating project…'); message('project-error','');
  try {
    const rows=await request('/rest/v1/projects',{method:'POST',authenticated:true,prefer:'return=representation',body:{name,description}});
    if(generation!==authGeneration) return;
    if(!rows?.[0]?.id) throw new Error('No project returned');
    projects=[rows[0],...projects]; preferredProjectId=rows[0].id;prepareOverview();renderProjects(); $('project-dialog').close();
    message('workspace-message','Project created.');
  } catch(err) {
    if(generation===authGeneration) {
      let text=friendlyError(err,'The project could not be saved. Try again.');
      if(err.name==='AbortError' || err instanceof TypeError) text='The connection ended before we could confirm the save. Close this window and refresh your projects before trying again, to avoid a duplicate.';
      message('project-error',text);
    }
  } finally { savingProject=false; busy($('save-project-button'),false,'Create project'); }
});
$('copy-project-id').addEventListener('click',async()=>{
  try { await navigator.clipboard.writeText(selectedProjectId); $('copy-project-id').textContent='Project ID copied'; }
  catch { $('copy-project-id').textContent='Select and copy the ID above'; }
});
async function acceptSession(next,expectedId){
  if(!next?.access_token||!next?.refresh_token||!next?.user?.id||expectedId&&next.user.id!==expectedId)throw new ApiError('Incomplete or mismatched session',400);
  authGeneration++;storeSession({access_token:next.access_token,refresh_token:next.refresh_token,expires_at:next.expires_at||Math.floor(Date.now()/1000)+(next.expires_in||3600),user:next.user});
  for(const id of ['password','signup-password','signup-confirm','phone-code'])$(id).value='';await openWorkspace();
}
async function refreshUser(){
  if(!session)return;const generation=authGeneration,id=session.user.id,user=await request('/auth/v1/user',{authenticated:true});
  if(generation!==authGeneration||session?.user.id!==id)return;if(user.id!==id)throw new ApiError('User mismatch',401);session.user=user;storeSession(session);$('account-email').textContent=user.email||user.phone||'';return user;
}
function deleteProject(target){
  if(!session||deletion.isBusy())return;if(!lab.canLeave()){if($('details-dialog').open)$('details-dialog').close();return;}
  const generation=authGeneration;deletion.open({kind:'project',id:target.id,name:target.name,onDeleted:async()=>{
    if(generation!==authGeneration)return;if(selectedProjectId===target.id){lab.reset();selectedProjectId='';if($('details-dialog').open)$('details-dialog').close();}
    projects=projects.filter(p=>p.id!==target.id);prepareOverview();renderProjects();message('workspace-message','Project deleted from your workspace.');loadingProjects=false;await loadProjects();
  }});
}
const themes=createThemes();
const phaseFour=createPhaseFour({request,friendlyError,getSession:()=>session,getGeneration:()=>authGeneration});
const lab=createLab({request,friendlyError,getSession:()=>session,getGeneration:()=>authGeneration,isDeleting:()=>deletion.isBusy(),onDeleteDevice:job=>deletion.open(job)});
const deletion=createDeletion({request,friendlyError,getSession:()=>session,getGeneration:()=>authGeneration});
const quickstart=createQuickstart({request,friendlyError,getSession:()=>session,getGeneration:()=>authGeneration,getProjects:()=>projects,canLeave:()=>!deletion.isBusy()&&lab.canLeave(),onReady:async(project,device,blueprint,review)=>{if(!projects.some(p=>p.id===project.id))projects=[project,...projects];renderProjects();const generation=authGeneration;await openProject(project,true);if(generation!==authGeneration||!session)return;await lab.stageStarter(blueprint,device,review);}});
const auth=createAuthAccess({request,friendlyError,baseUrl:SUPABASE_URL,getSession:()=>session,getGeneration:()=>authGeneration,acceptSession,refreshUser,canLeave:()=>!quickstart.isBusy()&&!deletion.isBusy()&&lab.canLeave()});
const pairing=createPairing({request,friendlyError,getSession:()=>session,getGeneration:()=>authGeneration,getProjects:()=>projects});
function openPairing(){if(!session||deletion.isBusy())return;if(!lab.canLeave()){if($('account-dialog').open)$('account-dialog').close();return;}return pairing.open(projects.find(p=>p.id===selectedProjectId)||preferredProject());}
const connectionGuide=createConnectionGuide({request,getSession:()=>session,getGeneration:()=>authGeneration,getScope:()=>lab.connectionScope(),getProjects:()=>projects,chooseProject:openProject,chooseDevice:id=>lab.selectExistingDevice(id),newDevice:options=>lab.registerDevice(options),newProject:()=>$('new-project-button').click(),simulateDevice:()=>lab.registerDevice(),viewDashboard:()=>lab.showConnectionDashboard(),showLegacyQr:openPairing});
const routes={
  overview:'Overview', devices:'Devices', dashboard:'Dashboard', datastreams:'Datastreams',
  rules:'Automations', events:'Events & Logs', analytics:'Analytics', library:'Experiments & groups'
};

function resumeId(){
  try{return localStorage.getItem('robosynct.resume.'+session?.user?.id)||'';}catch{return '';}
}

function projectHistory(){
  try{
    const ids=JSON.parse(localStorage.getItem('robosynct.recent.'+session?.user?.id)||'[]');
    return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[];
  }catch{return [];}
}

function rememberProject(id){
  try{
    localStorage.setItem('robosynct.resume.'+session.user.id,id);
    localStorage.setItem('robosynct.recent.'+session.user.id,JSON.stringify([id,...projectHistory().filter(value=>value!==id)].slice(0,8)));
  }catch{}
}

function recentProjects(){
  const ordered=[...projectHistory(),...projects.map(project=>project.id)];
  return [...new Set(ordered)].map(id=>projects.find(project=>project.id===id)).filter(Boolean);
}

function preferredProject(){return projects.find(project=>project.id===preferredProjectId);}

function renderProjectSelector(){
  const select=$('console-project');
  select.replaceChildren(new Option(projects.length?'Select project':'No projects',''));
  for(const project of projects)select.append(new Option(project.name,project.id));
  select.value=preferredProjectId;
  select.disabled=!projects.length;
  const studio=new URL('./studio.html',location.href);
  if(preferredProjectId)studio.searchParams.set('project',preferredProjectId);
  $('nav-studio').href=studio.href;
  const existing=preferredProject();
  $('overview-create-dashboard').textContent=existing?'Open or create dashboard':'Create dashboard';
}

function prepareOverview(){
  if(!preferredProject())preferredProjectId=(projects.find(project=>project.id===resumeId())||projects[0])?.id||'';
  renderProjectSelector();
  if(projectView==='overview')overview.select(preferredProject()||null);
}

async function navigate(view, target=preferredProject(), {editEmpty=false,deviceId=''}={}){
  if(!session||deletion.isBusy()||quickstart.isBusy())return;
  if(!target){
    message('workspace-message','Create a project to get started.');
    if(editEmpty)$('new-project-button').click();
    return;
  }
  const active=lab.connectionScope().project;
  const changed=active?.id!==target.id;
  if((changed||projectView!==view)&&!lab.canLeave()){renderProjectSelector();return;}
  const turn=++navigation,generation=authGeneration;
  if(changed)await openProject(target);
  else if(projectLoad)await projectLoad;
  if(turn!==navigation||generation!==authGeneration||lab.connectionScope().project?.id!==target.id)return;
  if(deviceId&&lab.connectionScope().device?.id!==deviceId)await lab.selectExistingDevice(deviceId).catch(()=>{});
  if(turn!==navigation||generation!==authGeneration)return;
  const moved=await lab.showExistingTab(view,{editEmpty});
  if(moved)document.getElementById(view==='events'?'events-title':view==='datastreams'?'datastreams-title':view==='dashboard'?'dashboard-title':'project-workspace-title')?.focus();
}

const overview=createOverview({
  request,generation:()=>authGeneration,
  openDashboard:project=>navigate('dashboard',project),
  openEvents:deviceId=>navigate('events',preferredProject(),{deviceId})
});

function closeMenu(){
  $('console-menu').setAttribute('aria-expanded','false');
  $('console-menu').textContent='Menu';
}

addEventListener('robosynct:project-view',event=>{
  projectView=event.detail;
  $('console-page').textContent=routes[projectView]||'Project';
  for(const item of document.querySelectorAll('[data-console-view]')){
    if(item.dataset.consoleView===projectView)item.setAttribute('aria-current','page');
    else item.removeAttribute('aria-current');
  }
  if(projectView==='overview'){
    navigation++;
    selectedProjectId='';
    prepareOverview();
    overview.dashboards(recentProjects());
    $('resume-project').disabled=!projects.some(project=>project.id===resumeId());
  }else overview.stop();
});

$('console-menu').addEventListener('click',event=>{
  const expanded=event.currentTarget.getAttribute('aria-expanded')==='true';
  event.currentTarget.setAttribute('aria-expanded',String(!expanded));
  event.currentTarget.textContent=expanded?'Menu':'Close menu';
});

$('console-project').addEventListener('change',event=>{
  const target=projects.find(project=>project.id===event.target.value);
  if(!target){renderProjectSelector();return;}
  if(projectView==='overview'){preferredProjectId=target.id;prepareOverview();}
  else navigate(projectView,target);
});

for(const item of document.querySelectorAll('[data-console-view]')){
  const view=item.dataset.consoleView;
  if(['overview','studio','phone','settings'].includes(view))continue;
  item.addEventListener('click',()=>{closeMenu();navigate(view);});
}
$('workspace-nav').addEventListener('click',()=>{closeMenu();if(projectView==='overview')$('overview-title').focus();});
$('nav-studio').addEventListener('click',event=>{if(deletion.isBusy()||!lab.canLeave())event.preventDefault();});
$('account-settings-button').addEventListener('click',closeMenu);
$('rules-cloud-open').addEventListener('click',()=>{if(lab.canLeave())phaseFour.open('rules',selectedProjectId);});
$('nav-phone').addEventListener('click',()=>{closeMenu();openPairing();});
$('overview-create-dashboard').addEventListener('click',()=>navigate('dashboard',preferredProject(),{editEmpty:true}));
$('overview-events').addEventListener('click',()=>navigate('events'));
$('resume-project').addEventListener('click',()=>{
  const target=projects.find(project=>project.id===resumeId());
  if(target)navigate('devices',target);
});
for(const id of ['home-connect-device','project-connect-device','add-device-button','empty-add-device'])$(id).addEventListener('click',async()=>{
  if(deletion.isBusy()||!lab.canLeave())return;
  if(!lab.connectionScope().project&&preferredProject())await openProject(preferredProject());
  if(session)connectionGuide.open();
});
$('connect-android-button').addEventListener('click',()=>$('phone-start-dialog').showModal());
$('account-qr-connect').addEventListener('click',openPairing);$('phone-legacy-qr').addEventListener('click',()=>{$('phone-start-dialog').close();return openPairing();});
$('delete-project-button').addEventListener('click',()=>{const target=projects.find(p=>p.id===selectedProjectId);if(target)deleteProject(target);});
for(const id of ['login-developer-info','developer-info-button','mobile-developer-info'])$(id).addEventListener('click',()=>$('developer-dialog').showModal());
function networkChange() {
  show($('offline-banner'),!navigator.onLine);
  if(navigator.onLine) { checkConnection(); if(session) loadProjects(); }
  else if(session){$('workspace-connection').textContent='Offline';$('workspace-connection').dataset.health='offline';overview.refresh();}
}
addEventListener('online',networkChange); addEventListener('offline',networkChange);
show($('offline-banner'),!navigator.onLine);
checkConnection();
(async()=>{
  try {
    if(auth.hasCallback()&&await auth.handleCallback())return;
    const raw=sessionStorage.getItem(SESSION_KEY);
    if(!raw) return;
    const saved=JSON.parse(raw);
    if(!saved.access_token || !saved.refresh_token || !saved.user?.id) { storeSession(null); return; }
    storeSession(saved);
    const current=await request('/auth/v1/user',{authenticated:true});
    if(current.id!==session?.user?.id) throw new ApiError('User mismatch',401);
    session.user=current; storeSession(session); await openWorkspace();
  } catch(err) {
    if(err.status===401 || err.status===403 || err instanceof SyntaxError) { clearState(); message('login-error','Please sign in to continue.'); }
    else message('login-error',friendlyError(err,'Couldn’t restore your session. Try signing in again.'));
  }
})();
