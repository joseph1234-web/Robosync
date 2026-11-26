import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mediaEdge } from '../supabase/functions/rs-media/adapter.mjs';

const pages = 'https://school-example.github.io';
const original = 'https://robosynct.principechristian220.chatgpt.site';
const backend = 'https://backend.example/functions/v1/rs-media';
const handler = async () => new Response('Authentication required', {status: 401});
const request = (origin, method) => new Request(backend, {method, headers: {Origin: origin}});
test('exact origins pass preflight and still require viewer authorization', async () => {
  const edge = mediaEdge(handler, {}, pages);
  for (const origin of [pages, original]) {
    const response = await edge(request(origin, 'OPTIONS'));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal((await edge(request(origin, 'GET'))).status, 401);
  }
  for (const origin of ['null', 'https://other.github.io', pages + '.example', 'http://school-example.github.io']) {
    assert.equal((await edge(request(origin, 'OPTIONS'))).status, 403);
  }
  assert.equal((await mediaEdge(handler, {})(request(pages, 'OPTIONS'))).status, 403);
  assert.equal((await edge(new Request(backend))).status, 401);
});

test('the release entrypoint supplies the RoboSynct GitHub Pages origin', async () => {
  const source = readFileSync(new URL('../supabase/functions/rs-media/index.ts', import.meta.url), 'utf8');
  const configured = /RS_PAGES_ORIGIN'\)\|\|'([^']+)'/.exec(source)?.[1];
  assert.equal(configured, 'https://joseph1234-web.github.io');
  const edge = mediaEdge(handler, {}, configured);
  assert.equal((await edge(request(configured, 'OPTIONS'))).headers.get('Access-Control-Allow-Origin'), configured);
  assert.equal((await edge(request(configured, 'GET'))).status, 401);
  assert.equal((await edge(request('https://unrelated.github.io', 'OPTIONS'))).status, 403);
});
