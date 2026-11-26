import { handleMedia } from './handler.mjs';
import { mediaAdapter, mediaEdge } from './adapter.mjs';
const io=mediaAdapter({base:Deno.env.get('SUPABASE_URL')!,service:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,gcSecret:Deno.env.get('RS_MEDIA_GC_SECRET')||''});
const pagesOrigin=Deno.env.get('RS_PAGES_ORIGIN')||'https://joseph1234-web.github.io';
Deno.serve(mediaEdge(handleMedia,io,pagesOrigin));
