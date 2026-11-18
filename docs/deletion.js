export function createDeletion({request,friendlyError,getSession,getGeneration}){
  const $=id=>document.getElementById(id);let job=null,busy=false,version=0;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const message=text=>{$('delete-error').textContent=text;$('delete-error').hidden=!text;};
  function sync(){$('delete-confirm-button').disabled=busy||!job||$('delete-name-input').value!==job.name;$('delete-name-input').disabled=busy;$('delete-confirm-button').textContent=busy?'Deleting…':'Delete permanently';}
  function open({kind,id,name,projectId,onDeleted}){
    if(busy||!getSession()||!['project','device'].includes(kind)||!uuid.test(id)||kind==='device'&&!uuid.test(projectId))return;
    job={kind,id,name,projectId,onDeleted};version++;$('delete-title').textContent='Delete '+kind+'?';$('delete-target-name').textContent=name;
    $('delete-impact').textContent=kind==='project'?'This permanently deletes the project, its devices, sensor streams, readings, events, rules, and saved dashboard.':'This permanently deletes the device, its sensor streams, readings, and events. Dashboard widgets and rules using this device will need another source.';
    $('delete-name-input').value='';$('delete-name-hint').textContent='Type “'+name+'” to confirm.';message('');sync();$('delete-dialog').showModal();$('delete-name-input').focus();
  }
  function reset(){version++;job=null;busy=false;message('');if($('delete-dialog').open)$('delete-dialog').close();sync();}
  async function remove(event){
    event.preventDefault();if(!job||busy||!getSession()||$('delete-name-input').value!==job.name)return;
    const target=job,generation=getGeneration(),v=version,userId=getSession().user.id;
    const current=()=>v===version&&generation===getGeneration()&&getSession()?.user.id===userId;
    const query='/rest/v1/'+(target.kind==='project'?'projects':'devices')+'?id=eq.'+encodeURIComponent(target.id)+(target.kind==='project'?'&owner_id=eq.'+encodeURIComponent(userId):'&project_id=eq.'+encodeURIComponent(target.projectId));
    busy=true;sync();message('');
    try{
      let writeError=null;try{await request(query,{method:'DELETE',authenticated:true,prefer:'return=minimal'});}catch(err){writeError=err;}
      if(!current())return;
      const remaining=await request(query+'&select=id',{authenticated:true});if(!current())return;
      if(!Array.isArray(remaining))throw new Error('Unexpected verification response');
      if(remaining.length){if(writeError)throw writeError;throw new Error('The record is still present. Check its DELETE policy or try again.');}
      busy=false;job=null;$('delete-dialog').close();await target.onDeleted();
    }catch(err){if(current())message(err.status?friendlyError(err,'Deletion could not be confirmed. Retry to check the same record safely.'):err.message==='The record is still present. Check its DELETE policy or try again.'?err.message:'Deletion could not be confirmed. Retry to check the same record safely.');}
    finally{if(current()){busy=false;sync();}}
  }
  $('delete-form').addEventListener('submit',remove);$('delete-name-input').addEventListener('input',sync);$('delete-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  return {open,reset,isBusy:()=>busy,blocksClose:id=>id==='delete-dialog'&&busy};
}
