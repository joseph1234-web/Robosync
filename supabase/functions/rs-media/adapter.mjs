/** Supabase HTTP adapter. Credentials stay in backend memory; sources are fixed. */
export function mediaAdapter({base,service,gcSecret='',fetcher=fetch}) {
  async function call(path,method,body,authorization=service,raw=false) {
    const response=await fetcher(base+path,{method,redirect:'error',headers:{apikey:service,Authorization:authorization.startsWith('Bearer ')?authorization:'Bearer '+authorization,'Content-Type':raw?'image/jpeg':'application/json','x-upsert':'false'},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
    if(!response.ok){const error=new Error('Backend media request failed');error.status=response.status;throw error;}
    return response;
  }
  const objectPath=path=>'/storage/v1/object/authenticated/rs-protected-snapshots/'+path;
  return {
    rpc:async(name,body,authorization)=>(await call('/rest/v1/rpc/'+name,'POST',body,authorization==='service'?service:authorization)).json(),
    write:async(path,bytes,hash)=>{try{await call('/storage/v1/object/rs-protected-snapshots/'+path,'POST',bytes,service,true);}catch(e){if(e.status!==409&&e.status!==400)throw e;const stored=new Uint8Array(await(await call(objectPath(path),'GET')).arrayBuffer());const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',stored)),n=>n.toString(16).padStart(2,'0')).join('');if(digest!==hash)throw Error('Immutable frame conflict');}},
    read:async path=>new Uint8Array(await(await call(objectPath(path),'GET')).arrayBuffer()),
    remove:async paths=>{await call('/storage/v1/object/rs-protected-snapshots','DELETE',{prefixes:paths});},
    isService:request=>gcSecret.length>=32&&request.headers.get('authorization')==='Bearer '+gcSecret
  };
}
const originalOrigin = 'https://robosynct.principechristian220.chatgpt.site';

export function mediaEdge(handleMedia, io, pagesOrigin = '') {
  if (pagesOrigin) {
    const url = new URL(pagesOrigin);
    if (url.protocol !== 'https:' || url.origin !== pagesOrigin || !url.hostname.endsWith('.github.io')) {
      throw new Error('RS_PAGES_ORIGIN must be one exact HTTPS github.io origin without a path.');
    }
  }
  return async request => {
    const origin = request.headers.get('origin');
    const allowed = origin === originalOrigin || Boolean(pagesOrigin && origin === pagesOrigin);
    if (origin !== null && !allowed) return new Response('Origin denied', { status: 403 });
    if (request.method === 'OPTIONS') {
      const headers = { 'Vary': 'Origin' };
      if (allowed) Object.assign(headers, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-rs-view',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      });
      return new Response(null, {status: 204, headers});
    }
    const response = await handleMedia(request, io);
    response.headers.append('Vary', 'Origin');
    if (allowed) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Expose-Headers', 'X-RS-Frame,X-RS-Received-At,X-RS-Captured-At,X-RS-Stale,X-RS-Source-Mode');
    }
    return response;
  };
}
