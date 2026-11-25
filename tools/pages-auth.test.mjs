import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthAccess} from '../docs/auth-access.js';
import {makePairingLink} from '../docs/qr-code.js';
import {parsePairingLink} from '../docs/mobile-protocol.js';
import {WEBSITE_ORIGIN} from '../docs/public-config.js';

test('email and OAuth redirect to this repository and omit dashboard query and fragment', async () => {
  const base = 'https://school-example.github.io/school-robotics/';
  const nodes = new Map(), listeners = new Map(), requests = [];
  let destination;
  globalThis.window = {location: {href: base+'index.html?project=demo#projects', assign: u => destination = new URL(u)}};
  globalThis.sessionStorage = {setItem() {}};
  globalThis.document = {getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {
      addEventListener(type, fn) { listeners.set(id+' '+type, fn); },
      classList: {toggle() {}}, setAttribute() {}
    });
    return nodes.get(id);
  }};
  const api = createAuthAccess({
    baseUrl:'https://backend.example', getSession:()=>null, getGeneration:()=>1,
    request: async path => {requests.push(path); return {};}, friendlyError:()=> 'fixture error'
  });
  for (const [key,value] of Object.entries({name:'Fixture',email:'fixture@example.invalid',password:'fixture-1234',confirm:'fixture-1234'})) {
    document.getElementById('signup-'+key).value = value;
  }
  await listeners.get('signup-form submit')({preventDefault() {}});
  assert.equal(new URL(requests[0], 'https://backend.example').searchParams.get('redirect_to'), base);
  api.setSettings({external:{google:true}});
  await listeners.get('auth-google click')();
  assert.equal(destination.origin,'https://backend.example');
  assert.equal(destination.searchParams.get('redirect_to'),base);
  assert.equal(destination.searchParams.get('code_challenge_method'),'s256');
});

test('existing Android pairing keeps its exact origin and route', () => {
  const id='00000000-0000-4000-8000-000000000001', invite='1'.repeat(64);
  const url=makePairingLink(WEBSITE_ORIGIN,id,invite);
  assert.equal(new URL(url).pathname,'/android-connect.html');
  assert.deepEqual(parsePairingLink(url,WEBSITE_ORIGIN),{id,invite});
  assert.throws(()=>parsePairingLink(url,'https://school-example.github.io'));
});

test('browser Phone Sync accepts the exact Pages route and preserves origin checks', () => {
  const id='00000000-0000-4000-8000-000000000001',invite='1'.repeat(64);
  const browserOrigin='https://school-example.github.io',path='/Robosync/android-connect.html';
  const link=new URL(path,browserOrigin);
  link.hash=new URL(makePairingLink(WEBSITE_ORIGIN,id,invite)).hash;
  assert.deepEqual(parsePairingLink(link,browserOrigin,path),{id,invite});
  assert.throws(()=>parsePairingLink(link,browserOrigin,'/other/android-connect.html'));
  assert.throws(()=>parsePairingLink(link,WEBSITE_ORIGIN,path));
});
