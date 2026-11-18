const AUTH_FLOW_KEY='robosynct.auth-flow.v1';
export function normalizePhone(value){const phone=String(value).replace(/[\s()\-]/g,'');if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new Error('Enter your phone with its country code, such as +639171234567.');return phone;}
export async function makePkce(){
  const bytes=crypto.getRandomValues(new Uint8Array(48)),verifier=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
  const challenge=btoa(String.fromCharCode(...digest)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return {verifier,challenge};
}
export function createAuthAccess({request,friendlyError,baseUrl,getSession,getGeneration,acceptSession,refreshUser,canLeave}){
  const $=id=>document.getElementById(id),show=(id,on=true)=>{$(id).hidden=!on;},message=(id,text)=>{$(id).textContent=text;show(id,!!text);};
  let settings=null,authBusy=false,version=0,phoneLogin=null,phoneLink=null;const sentAfter={login:0,link:0};
  const buttonIds=['signin-button','signup-button','auth-google','auth-facebook','phone-send','phone-verify','account-link-google','account-link-facebook','account-phone-send','account-phone-verify'];
  const returnUrl=()=>new URL('./',window.location.href).href;
  function lock(on){authBusy=on;for(const id of buttonIds)$(id).disabled=on;}
  function authError(err,fallback){
    if(['provider_disabled','unsupported_provider','manual_linking_disabled'].includes(err.code))return err.code==='manual_linking_disabled'?'Connecting providers must be enabled by the app administrator in Supabase Authentication settings. See the setup guide.':'This sign-in provider is not enabled yet. Use email or ask the app administrator to finish provider setup.';
    if(['phone_provider_disabled','sms_send_failed'].includes(err.code))return 'SMS sign-in is unavailable. The app administrator needs to enable Phone and configure an SMS provider.';
    if(['otp_expired','otp_disabled','validation_failed'].includes(err.code))return 'The code is invalid or expired. Check the code or request another one.';
    if(err.status===422||err.code==='weak_password')return 'Supabase could not accept these details. Check the password requirements and whether this method is already connected to another account.';
    return err.local?err.message:friendlyError(err,fallback);
  }
  const localError=text=>Object.assign(new Error(text),{local:true});
  function mode(signup){show('login-form',!signup);show('signup-form',signup);$('auth-login-tab').classList.toggle('active',!signup);$('auth-signup-tab').classList.toggle('active',signup);$('auth-login-tab').setAttribute('aria-pressed',String(!signup));$('auth-signup-tab').setAttribute('aria-pressed',String(signup));message('login-error','');message('signup-error','');}
  function setSettings(value){settings=value;const ext=value?.external||{};$('auth-provider-states').textContent=['Google: '+(ext.google?'ready':'setup needed'),'Facebook: '+(ext.facebook?'ready':'setup needed'),'Phone: '+(ext.phone?'enabled':'setup needed')].join(' · ');}
  async function refreshSettings(){const value=await request('/auth/v1/settings');setSettings(value);return value;}
  async function requireProvider(provider){if(!settings)await refreshSettings();if(!settings?.external?.[provider])throw localError(provider==='phone'?'Phone sign-in needs an enabled SMS provider. You can use email while setup is completed.':'This provider is not enabled in RoboSynct yet. Use email, or open the sign-in setup guide.');}
  function reset(){version++;phoneLogin=phoneLink=null;sentAfter.login=sentAfter.link=0;lock(false);for(const id of ['signup-password','signup-confirm','phone-code','account-phone-code','account-phone-number','phone-number'])$(id).value='';for(const id of ['phone-code-form','account-phone-code-form','phone-auth-panel'])show(id,false);for(const id of ['account-identity','account-providers'])$(id).textContent='';for(const id of ['account-error','account-notice','phone-error','phone-notice','signup-error','auth-notice'])message(id,'');try{sessionStorage.removeItem(AUTH_FLOW_KEY);}catch{}mode(false);}
  async function signup(event){
    event.preventDefault();if(authBusy)return;const name=$('signup-name').value.trim(),email=$('signup-email').value.trim(),password=$('signup-password').value,confirmation=$('signup-confirm').value;
    if(!name||name.length>120||!/^\S+@\S+\.\S+$/.test(email)||password.length<8||password.length>128||password!==confirmation){message('signup-error','Enter your name, a valid email, and matching passwords of 8–128 characters.');return;}
    const v=version;lock(true);message('signup-error','');
    try{
      const next=await request('/auth/v1/signup?redirect_to='+encodeURIComponent(returnUrl()),{method:'POST',body:{email,password,data:{display_name:name}}});if(v!==version)return;
      $('signup-password').value='';$('signup-confirm').value='';$('email').value=email;
      if(next?.access_token&&next?.user?.id)await acceptSession(next);else{mode(false);message('auth-notice','Check your email for a confirmation link if this address is eligible. After confirming, return here and sign in with your password.');}
    }catch(err){if(v===version)message('signup-error',authError(err,'Couldn’t create the account. Check your details or try signing in if you already registered.'));}
    finally{if(v===version)lock(false);}
  }
  async function startOAuth(provider,link=false){
    if(authBusy||!link&&getSession()||!['google','facebook'].includes(provider)||link&&!getSession())return;
    if(link&&!canLeave()){message('account-error','Save or discard dashboard changes before connecting a sign-in provider.');return;}
    const v=version,g=getGeneration(),expectedId=link?getSession().user.id:null,errorId=link?'account-error':'login-error';lock(true);message(errorId,'');
    try{
      await requireProvider(provider);const {verifier,challenge}=await makePkce();if(v!==version||g!==getGeneration())return;
      const pending={verifier,provider,userId:expectedId,created:Date.now(),redirect:returnUrl()};try{sessionStorage.setItem(AUTH_FLOW_KEY,JSON.stringify(pending));}catch{throw localError('Your browser must allow session storage for secure provider sign-in.');}
      const params=new URLSearchParams({provider,redirect_to:returnUrl(),code_challenge:challenge,code_challenge_method:'s256'});let destination=baseUrl+'/auth/v1/authorize?'+params;
      if(link){params.set('skip_http_redirect','true');const data=await request('/auth/v1/user/identities/authorize?'+params,{authenticated:true});if(v!==version||g!==getGeneration())return;destination=data?.url;}
      const url=new URL(destination),allowedHosts=provider==='google'?['accounts.google.com']:['www.facebook.com','m.facebook.com','facebook.com'];
      if(url.protocol!=='https:'||url.username||url.password||url.origin!==new URL(baseUrl).origin&&!allowedHosts.includes(url.hostname))throw localError('The sign-in redirect was not recognized. Please try again.');
      for(const id of ['password','signup-password','signup-confirm'])$(id).value='';window.location.assign(url.href);
    }catch(err){if(v===version){try{sessionStorage.removeItem(AUTH_FLOW_KEY);}catch{}message(errorId,authError(err,'Provider sign-in could not start. Check its Supabase settings and try again.'));}}
    finally{if(v===version){lock(false);if(link)renderAccount();}}
  }
  async function handleCallback(){
    const url=new URL(window.location.href),fragment=new URLSearchParams(url.hash.slice(1)),code=url.searchParams.get('code'),callbackError=url.searchParams.get('error')||fragment.get('error'),hasToken=fragment.has('access_token')||fragment.has('refresh_token');
    if(!code&&!callbackError&&!hasToken)return false;
    const clean=new URL(url.href);for(const key of ['code','error','error_description','error_code','sb_flow_id'])clean.searchParams.delete(key);if(hasToken||callbackError)clean.hash='';window.history.replaceState(null,'',clean.pathname+clean.search+clean.hash);
    if(callbackError){message('login-error','Sign-in was cancelled or could not be completed. Please start again.');try{sessionStorage.removeItem(AUTH_FLOW_KEY);}catch{}return true;}
    if(hasToken){message('auth-notice','Authentication link received. If you confirmed your email, sign in below with your password to continue.');return true;}
    let pending;try{pending=JSON.parse(sessionStorage.getItem(AUTH_FLOW_KEY)||'null');}catch{}
    if(!pending||!/^[a-f0-9]{96}$/.test(pending.verifier)||!['google','facebook'].includes(pending.provider)||pending.redirect!==returnUrl()||!Number.isFinite(pending.created)||Date.now()-pending.created>600000||Date.now()<pending.created){try{sessionStorage.removeItem(AUTH_FLOW_KEY);}catch{}message('login-error','This sign-in attempt is missing or expired. Use the provider button again in this browser tab.');return true;}
    const v=version;lock(true);
    try{const next=await request('/auth/v1/token?grant_type=pkce',{method:'POST',body:{auth_code:code,code_verifier:pending.verifier}});if(v!==version)return true;if(pending.userId&&next?.user?.id!==pending.userId)throw localError('The returned account did not match the account being connected. Sign in to your original account and try again.');await acceptSession(next,pending.userId);}
    catch(err){if(v===version)message('login-error',authError(err,'Sign-in could not finish. Start again using the provider button.'));}
    finally{try{sessionStorage.removeItem(AUTH_FLOW_KEY);}catch{}if(v===version)lock(false);}return true;
  }
  function renderAccount(){
    const user=getSession()?.user;if(!user)return;const providers=[...new Set([...(user.identities||[]).map(i=>i.provider),...(user.app_metadata?.providers||[])])];
    $('account-identity').textContent=user.email||user.phone||'RoboSynct account';$('account-providers').textContent='Connected methods: '+(providers.length?providers.join(', '):user.phone?'phone':'email');
    for(const provider of ['google','facebook']){const button=$('account-link-'+provider),connected=providers.includes(provider);button.disabled=authBusy||connected;button.textContent=connected?provider[0].toUpperCase()+provider.slice(1)+' connected':'Connect '+provider[0].toUpperCase()+provider.slice(1);}
    $('account-phone-number').value=phoneLink?.phone|| (user.phone?(user.phone.startsWith('+')?user.phone:'+'+user.phone):'');
  }
  async function openAccount(){
    if(!getSession())return;message('account-error','');message('account-notice','');renderAccount();$('account-dialog').showModal();const v=version;
    try{await refreshUser();if(v===version)renderAccount();}catch(err){if(v===version)message('account-error',authError(err,'Couldn’t refresh your connected methods.'));}
  }
  async function sendPhone(event,link=false){
    event.preventDefault();if(authBusy||link&&!getSession()||!link&&getSession())return;const prefix=link?'account-phone':'phone',errorId=link?'account-error':'phone-error',noticeId=link?'account-notice':'phone-notice',kind=link?'link':'login',v=version,g=getGeneration(),userId=getSession()?.user.id;message(errorId,'');
    let phone;try{phone=normalizePhone($(prefix+'-number').value);if(Date.now()<sentAfter[kind])throw localError('Please wait '+Math.ceil((sentAfter[kind]-Date.now())/1000)+' seconds before requesting another code.');}catch(err){message(errorId,err.message);return;}
    lock(true);
    try{
      await requireProvider('phone');if(v!==version||g!==getGeneration())return;
      const result=await request(link?'/auth/v1/user':'/auth/v1/otp',{method:link?'PUT':'POST',authenticated:link,body:link?{phone}:{phone,create_user:true,channel:'sms'}});if(v!==version||g!==getGeneration())return;
      sentAfter[kind]=Date.now()+60000;const pending={phone,userId,generation:g};if(link)phoneLink=pending;else phoneLogin=pending;
      if(link&&result?.phone_confirmed_at&&String(result.phone).replace(/^\+/,'')===phone.slice(1)){await refreshUser();phoneLink=null;show('account-phone-code-form',false);message(noticeId,'Phone connected to this account.');renderAccount();}
      else{show(prefix+'-code-form');$(prefix+'-code').value='';$(prefix+'-code').focus();message(noticeId,'A verification code was requested for '+phone+'. Enter it below. Wait at least 60 seconds before requesting another code.');}
    }catch(err){if(v===version)message(errorId,authError(err,'Couldn’t send the SMS code. Check the number and SMS provider setup.'));}
    finally{if(v===version){lock(false);if(link)renderAccount();}}
  }
  async function verifyPhone(event,link=false){
    event.preventDefault();if(authBusy||!link&&getSession())return;const pending=link?phoneLink:phoneLogin,prefix=link?'account-phone':'phone',errorId=link?'account-error':'phone-error',v=version,token=$(prefix+'-code').value.trim();
    if(!pending||!/^\d{6,10}$/.test(token)||pending.phone!==(()=>{try{return normalizePhone($(prefix+'-number').value);}catch{return '';}})()){message(errorId,'Request a code for this number, then enter the 6–10 digit verification code.');return;}
    if(link&&(!getSession()||getSession().user.id!==pending.userId||getGeneration()!==pending.generation)){message(errorId,'Your account changed. Request a new verification code.');return;}
    lock(true);message(errorId,'');
    try{
      const next=await request('/auth/v1/verify',{method:'POST',authenticated:link,body:{phone:pending.phone,token,type:link?'phone_change':'sms'}});if(v!==version)return;
      $(prefix+'-code').value='';if(link){if(next?.user?.id&&next.user.id!==pending.userId)throw localError('The verified account did not match. Sign in again.');await refreshUser();phoneLink=null;show('account-phone-code-form',false);message('account-notice','Phone verified and connected to this account.');renderAccount();}else{phoneLogin=null;await acceptSession(next);show('phone-code-form',false);}
    }catch(err){if(v===version)message(errorId,authError(err,'The code could not be verified. Check it or request another code.'));}
    finally{if(v===version){lock(false);if(link)renderAccount();}}
  }
  $('auth-login-tab').addEventListener('click',()=>{if(!authBusy)mode(false);});$('auth-signup-tab').addEventListener('click',()=>{if(!authBusy)mode(true);});$('signup-form').addEventListener('submit',signup);
  for(const provider of ['google','facebook']){$('auth-'+provider).addEventListener('click',()=>startOAuth(provider));$('account-link-'+provider).addEventListener('click',()=>startOAuth(provider,true));}
  $('auth-phone-toggle').addEventListener('click',()=>show('phone-auth-panel',$('phone-auth-panel').hidden));$('phone-form').addEventListener('submit',event=>sendPhone(event));$('phone-code-form').addEventListener('submit',event=>verifyPhone(event));
  $('account-phone-form').addEventListener('submit',event=>sendPhone(event,true));$('account-phone-code-form').addEventListener('submit',event=>verifyPhone(event,true));
  for(const link of [false,true]){const prefix=link?'account-phone':'phone';$(prefix+'-number').addEventListener('input',()=>{if(link)phoneLink=null;else phoneLogin=null;show(prefix+'-code-form',false);$(prefix+'-code').value='';});}
  $('auth-refresh-methods').addEventListener('click',async()=>{try{await refreshSettings();message('auth-notice','Sign-in methods refreshed.');}catch(err){message('login-error',authError(err,'Couldn’t refresh sign-in methods.'));}});
  for(const id of ['account-settings-button','account-avatar'])$(id).addEventListener('click',openAccount);$('account-refresh').addEventListener('click',openAccount);
  $('auth-setup-guide').addEventListener('click',()=>window.open('./integration-guide.html','_blank','noopener,noreferrer'));
  $('account-dialog').addEventListener('cancel',event=>{if(authBusy)event.preventDefault();});
  return {setSettings,handleCallback,hasCallback:()=>/[?&](code|error)=/.test(window.location.search)||/access_token=|refresh_token=|error=/.test(window.location.hash),reset,isBusy:()=>authBusy,blocksClose:id=>id==='account-dialog'&&authBusy};
}
