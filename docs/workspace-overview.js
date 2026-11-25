import { deviceReport, inventoryDate, loadDeviceReports } from './device-inventory.js?v=3.0.0';

const $ = id => document.getElementById(id);

function listMessage(root, text) {
  const item = document.createElement(root.tagName === 'UL' ? 'li' : 'p');
  item.className = 'console-empty';
  item.textContent = text;
  root.replaceChildren(item);
}

export function createOverview({request, generation, openDashboard, openEvents}) {
  let activeProject=null, sequence=0, timer=null;

  function latestAlerts(alerts, devices) {
    const root = $('overview-alerts');
    if (!alerts?.length) {
      listMessage(root, alerts ? 'No recent alerts.' : 'Alerts unavailable.');
      return;
    }
    root.replaceChildren();
    for (const alert of alerts) {
      const item=document.createElement('li'), content=document.createElement('div');
      const title=document.createElement('strong'), info=document.createElement('small'), badge=document.createElement('button');
      item.className='console-list-item';
      title.textContent=alert.title;
      info.textContent=[devices.find(device=>device.id===alert.device_id)?.label,inventoryDate(alert.occurred_at)].filter(Boolean).join(' · ');
      badge.className='text-button';
      badge.type='button';
      badge.textContent=alert.acknowledged_at?'Acknowledged':'Open event';
      badge.addEventListener('click',()=>openEvents(alert.device_id));
      content.append(title,info);
      item.append(content,badge);
      root.append(item);
    }
  }

  function dashboards(projects) {
    const root=$('overview-dashboards');
    if (!projects.length) { listMessage(root,'Create a project to start a dashboard.'); return; }
    root.replaceChildren();
    for (const project of projects.slice(0,3)) {
      const row=document.createElement('div'), title=document.createElement('strong'), button=document.createElement('button');
      row.className='console-list-item';
      title.textContent=project.name;
      button.className='text-button';
      button.type='button';
      button.textContent='Open dashboard';
      button.setAttribute('aria-label','Open dashboard for '+project.name);
      button.addEventListener('click',()=>openDashboard(project));
      row.append(title,button);
      root.append(row);
    }
  }

  function metrics(hardware=[], reports=new Map()) {
    const states=hardware.map(device=>deviceReport(device,reports.get(device.id)));
    const online=states.filter(state=>state.status==='online').length;
    const ready=states.filter(state=>state.controlOnline).length;
    const latest=states.map(state=>state.lastUpload).filter(Boolean).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
    const known=states.filter(state=>state.backlog!==null);
    $('overview-online').textContent=activeProject ? String(online) : '—';
    $('overview-control').textContent=activeProject ? ready+' with recent control contact' : 'Waiting for a project';
    $('overview-upload').textContent=latest?new Date(latest).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit',second:'2-digit'}):'—';
    $('overview-upload-detail').textContent=latest?inventoryDate(latest):'No confirmed upload reported';
    $('overview-backlog').textContent=known.length ? String(known.reduce((sum,state)=>sum+state.backlog,0)) : '—';
    $('overview-backlog-detail').textContent=known.length ? 'Snapshots reported by '+known.length+' of '+hardware.length+' boards' : 'No queue report';
  }

  function status(text) {
    $('overview-status').textContent=text;
    $('overview-status').hidden=!text;
  }

  function stop() {
    sequence++;
    clearTimeout(timer);
  }

  async function refresh() {
    stop();
    if (!activeProject || $('workspace-overview').hidden) return;
    if (!navigator.onLine) { status('Offline · showing the last loaded reports.'); return; }
    const run=sequence, account=generation(), project=activeProject;
    const current=()=>run===sequence && account===generation() && !$('workspace-overview').hidden;
    try {
      const devices=await request('/rest/v1/devices?select=id,label,project_id,board_model,config&project_id=eq.'+encodeURIComponent(project.id),{authenticated:true});
      if (!current()) return;
      if (!Array.isArray(devices)) throw new Error('Device list unavailable');
      const scoped=devices.filter(device=>device.project_id===project.id);
      const hardware=scoped.filter(device=>device.config?.mode!=='simulation');
      const alerts=async()=>{
        const pages=[];
        for (let i=0;i<scoped.length && current();i+=30) {
          const ids=scoped.slice(i,i+30).map(device=>device.id).join(',');
          const response=await request('/rest/v1/events?select=id,device_id,title,severity,occurred_at,acknowledged_at&device_id=in.('+encodeURIComponent(ids)+')&severity=in.(warning,critical)&order=occurred_at.desc&limit=5',{authenticated:true});
          if (!Array.isArray(response)) throw new Error('Alerts unavailable');
          pages.push(...response);
        }
        const owned=new Set(scoped.map(device=>device.id));
        return pages.filter(event=>owned.has(event.device_id)).sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at)).slice(0,5);
      };
      const [reports, events]=await Promise.all([loadDeviceReports(request, hardware, current), alerts().catch(()=>null)]);
      if (!current()) return;
      metrics(hardware,reports);
      latestAlerts(events,scoped);
      status(hardware.some(device=>!reports.has(device.id))?'Some boards could not be checked.':'');
    } catch {
      if (current()) status('Project status unavailable. Use Refresh to try again.');
    } finally {
      if (current()) timer=setTimeout(refresh,15000);
    }
  }

  function select(project) {
    stop();
    activeProject=project;
    $('overview-title').textContent=project?'Welcome to RoboSynct':'Overview';
    $('overview-project').textContent=project?'Current project · '+project.name:'Create a project or open an existing one.';
    $('overview-events').disabled=!project;
    metrics();
    if(project)$('overview-online').textContent='—';
    listMessage($('overview-alerts'),project?'Checking for alerts…':'Choose a project to view its alerts.');
    status('');
    return refresh();
  }

  return { select, dashboards, refresh, stop, reset(){select(null);dashboards([]);} };
}
