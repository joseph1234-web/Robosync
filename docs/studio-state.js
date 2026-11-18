import { layoutV4 } from './studio-model.js?v=0.37.0';
const copy=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** One owner/project draft. Durable save IDs survive failed replies; commands never enter this store. */
export class StudioState {
  constructor({owner,project='',storage,write}) {
    this.owner=owner;this.project=project;this.storage=storage;this.write=write;
    this.key='robosynct.studio.'+owner+'.'+(project||'new');
    this.config=layoutV4();this.record=null;this.base=0;this.pending=null;
    this.formDrafts={};this.layoutDirty=false;this.conflict=false;this.busy=false;
    this.undoStack=[];this.storageError='';this.rejected=false;this.uncertain=false;this.pendingFormKey='';
  }
  restore(record) {
    this.record=record||null;this.saved=layoutV4(record?.config);this.config=copy(this.saved);
    this.base=record?.revision||0;this.pending=null;this.formDrafts={};this.layoutDirty=false;this.conflict=false;
    let raw;try{raw=this.storage.getItem(this.key);}catch{this.storageError='Browser draft storage is unavailable. Keep this page open.';return;}
    if(!raw)return;
    let draft;try{draft=JSON.parse(raw);this.config=layoutV4(draft.config);}catch{this.storageError='The saved draft cannot be opened. It has been retained unchanged.';return;}
    this.base=Number.isInteger(draft.base)?draft.base:this.base;
    this.pending=draft.pending?.p_request?copy(draft.pending):null;
    this.formDrafts=draft.formDrafts||{};this.pendingFormKey=draft.pendingFormKey||'';
    this.layoutDirty=draft.layoutDirty===undefined?true:draft.layoutDirty===true;
    this.conflict=!!draft.pending?.conflict||(this.layoutDirty&&this.base!==(record?.revision||0)&&(this.pending?.p_kind!=='dashboard'||draft.rejected===true));
    this.rejected=draft.rejected===true;this.uncertain=this.pending?draft.uncertain!==false:false;
  }
  persist(required=false) {
    const value={version:2,base:this.base,config:this.config,pending:this.pending,formDrafts:this.formDrafts,layoutDirty:this.layoutDirty,rejected:this.rejected,uncertain:this.uncertain,pendingFormKey:this.pendingFormKey};
    try{this.storage.setItem(this.key,JSON.stringify(value));this.storageError='';}
    catch{this.storageError='This browser could not retain the draft. Keep the page open; cloud saves are paused.';if(required)throw Error(this.storageError);}
  }
  change(next) {
    if(this.busy||this.pending)throw Error('Confirm or retry the pending save before editing the dashboard.');
    this.undoStack.push(copy(this.config));if(this.undoStack.length>30)this.undoStack.shift();
    this.config=layoutV4(next);this.layoutDirty=!same(this.config,this.saved);this.persist();
  }
  undo(){if(!this.undoStack.length||this.busy||this.pending)return;this.config=this.undoStack.pop();this.layoutDirty=!same(this.config,this.saved);this.persist();}
  retainForm(key,values){this.formDrafts[key]=copy(values);this.persist();}
  discard(){if(this.pending||this.busy)throw Error('An unconfirmed save must be retried before discarding its identity.');this.config=copy(this.saved);this.base=this.record?.revision||0;this.conflict=false;this.layoutDirty=false;this.formDrafts={};this.undoStack=[];this.persist();}
  async send(job,formKey='') {
    if(this.pending)throw Error('Retry the unconfirmed save with its original identity.');
    if(job.p_kind==='dashboard'&&this.conflict)throw Error('Saved revision changed. Review the saved layout before replacing your draft.');
    this.pending=copy(job);this.pendingFormKey=formKey;this.rejected=false;this.uncertain=false;this.persist(true);return this.retry();
  }
  async retry() {
    if(this.busy)throw Error('A save is already being confirmed.');
    if(!this.pending)throw Error('No unconfirmed save.');
    this.persist(true);const job=copy(this.pending);this.busy=true;
    try{
      const result=await this.write(job);
      if(job.p_kind==='dashboard'){
        this.record=result;this.saved=layoutV4(result.config);this.base=result.revision;this.conflict=false;
        this.layoutDirty=!same(this.config,job.p_payload);if(!this.layoutDirty)this.config=copy(this.saved);
      }
      if(this.pendingFormKey)delete this.formDrafts[this.pendingFormKey];this.pendingFormKey='';this.pending=null;this.rejected=false;this.uncertain=false;this.persist();return{job,result};
    }catch(error){if(error.status===409&&job.p_kind==='dashboard')this.conflict=true;this.rejected=!this.uncertain&&Number.isInteger(error.status)&&error.status>=400&&error.status<500&&error.status!==408&&error.status!==429;if(!this.rejected)this.uncertain=true;this.persist();throw error;}
    finally{this.busy=false;}
  }
  fixRejected(){if(this.busy||!this.rejected)throw Error('Retry the unconfirmed save first.');this.pending=null;this.rejected=false;this.uncertain=false;this.persist();}
}
