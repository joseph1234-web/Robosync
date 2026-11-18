import { emptyProjectLibrary, cleanProjectLibrary, projectLibraryId } from './library-model.js?v=0.36.1';

// A separate note row uses the audited widgets owner policy. The project-ID
// dashboard row and its schema versions 1–3 remain untouched by library saves.
export function createLibraryStore({request,getSession,getGeneration,onChange=()=>{}}){
  const copy=x=>JSON.parse(JSON.stringify(x));
  let projectId=null,id=null,version=0,revision=0,ready=false,busy=false,document=emptyProjectLibrary(),saved=emptyProjectLibrary(),pending=null;
  const state=()=>({projectId,id,revision,ready,busy,dirty:JSON.stringify(document)!==JSON.stringify(saved),document:copy(document),saved:copy(saved)});
  const context=()=>({version,generation:getGeneration(),projectId});
  const current=c=>getSession()&&c.version===version&&c.generation===getGeneration()&&c.projectId===projectId;
  const emit=()=>onChange(state());
  function reset(){version++;projectId=id=null;revision=0;ready=busy=false;document=emptyProjectLibrary();saved=emptyProjectLibrary();pending=null;emit();}
  async function read(){
    const rows=await request('/rest/v1/widgets?select=id,project_id,widget_type,config,revision&id=eq.'+encodeURIComponent(id)+'&project_id=eq.'+encodeURIComponent(projectId)+'&limit=1',{authenticated:true});
    if(!Array.isArray(rows)||rows.length>1)throw new Error('Unexpected project library response.');
    if(!rows.length)return {revision:0,document:emptyProjectLibrary(),token:null};
    const row=rows[0];if(row.id!==id||row.project_id!==projectId||row.widget_type!=='note'||!Number.isInteger(row.revision)||row.revision<1)throw new Error('This saved library record is unsupported; no changes were made.');
    return {revision:row.revision,document:cleanProjectLibrary(row.config),token:row.config.save_token||null};
  }
  async function open(nextProject){
    if(projectId===nextProject.id&&ready)return state();
    reset();projectId=nextProject.id;const c=context();
    try{id=await projectLibraryId(projectId);if(!current(c))return;const fresh=await read();if(!current(c))return;revision=fresh.revision;document=copy(fresh.document);saved=copy(document);ready=true;emit();return state();}
    catch(e){if(current(c)){ready=false;emit();}throw e;}
  }
  function change(next){if(!ready||busy||!getSession())throw new Error('Load the project library before editing.');document=cleanProjectLibrary(next);emit();}
  function discard(){if(busy)return;document=copy(saved);emit();}
  async function reload(){if(busy||state().dirty)throw new Error('Save or discard your library draft before reloading.');ready=false;return open({id:projectId});}
  async function save(){
    if(!ready||busy||!state().dirty||!getSession())return false;
    const c=context();busy=true;emit();
    try{
      let fresh=await read();if(!current(c))return false;
      if(pending&&fresh.token===pending.token){revision=fresh.revision;saved=copy(fresh.document);pending=null;if(!state().dirty){document=copy(saved);return true;}}
      if(fresh.revision!==revision)throw new Error('The project library changed in another session. Your draft is retained. Discard it and reload before editing again.');
      const signature=JSON.stringify(document);if(!pending||pending.signature!==signature||pending.base!==revision)pending={token:crypto.randomUUID(),base:revision,signature,document:copy(document)};
      const job=pending,body={widget_type:'note',title:'Project templates and groups',revision:revision+1,config:{...job.document,save_token:job.token}};
      if(!revision)await request('/rest/v1/widgets?on_conflict=id',{method:'POST',authenticated:true,prefer:'resolution=ignore-duplicates,return=minimal',body:{id,project_id:projectId,...body}});
      else await request('/rest/v1/widgets?id=eq.'+encodeURIComponent(id)+'&project_id=eq.'+encodeURIComponent(projectId)+'&revision=eq.'+revision,{method:'PATCH',authenticated:true,prefer:'return=minimal',body});
      if(!current(c))return false;fresh=await read();if(!current(c))return false;
      if(fresh.token!==job.token||fresh.revision!==job.base+1)throw new Error('Library save could not be confirmed. Retry Save library to check the same operation before discarding your draft.');
      revision=fresh.revision;document=copy(fresh.document);saved=copy(document);pending=null;return true;
    }finally{if(current(c)){busy=false;emit();}}
  }
  return {state,reset,open,change,discard,reload,save};
}
