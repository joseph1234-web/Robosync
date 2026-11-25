"""Run with Python Playwright + Chromium: python3 tools/workspace_smoke.py.

Every HTTP request is intercepted before navigation. All writes go to a new
in-memory fixture; the test cannot sign in to Supabase or send board commands.
"""
import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from mimetypes import guess_type
from pathlib import Path
import re
from shutil import which
from urllib.parse import parse_qs, unquote, urlsplit

from playwright.sync_api import expect, sync_playwright

DOCS = Path(__file__).resolve().parents[1] / 'docs'
SITE = 'https://workspace.example.invalid/Robosync/'
BACKEND = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", (DOCS / 'public-config.js').read_text())[1]


def uid(i):
    return f'70000000-0000-4000-8000-{i:012}'


def stamp(seconds=0):
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()


class Workspace:
    def __init__(self):
        self.users = {f'{n}@example.invalid': {'id': uid(i), 'email': f'{n}@example.invalid'}
                      for i, n in enumerate(['student', 'visitor'], 1)}
        self.projects = [{'id': uid(10 + i), 'owner_id': user['id'], 'name': name,
                          'description': 'ESP32 classroom workspace', 'created_at': stamp(3600)}
                         for i, (user, name) in enumerate(zip(self.users.values(), ['Greenhouse Lab', 'Visitor Lab']))]
        self.project = self.projects[0]['id']
        self.device = {'id': uid(20), 'project_id': self.project, 'label': 'Greenhouse ESP32',
                       'board_model': 'esp32-devkit-v1', 'transport': 'wifi', 'created_at': stamp(3600),
                       'last_seen_at': stamp(4), 'config': {'mode': 'hardware'}}
        self.channels, self.telemetry, widgets = [], [], []
        for k, (title, key, kind, widget, vpin, gpio, unit, value) in enumerate([
                ('Temperature', 'temperature', 'number', 'value', 1, 4, '°C', 27.4),
                ('Humidity', 'humidity', 'number', 'value', 2, 4, '%', 72),
                ('Sound activity', 'sound_raw', 'number', 'progress', 7, 18, 'raw', 38),
                ('Relay', 'relay', 'boolean', 'switch', 6, 13, '', None),
                ('RGB LED', 'rgb', 'rgb', 'rgb', 8, 22, '', None)]):
            output = value is None
            io = {'version': 1, 'kind': 'output' if output else 'sensor', 'type': kind}
            if output:
                io.update(driver='rgb' if kind == 'rgb' else 'digital', operations=['set'])
            if kind == 'rgb':
                io['rgb_pins'] = [22, 21, 19]
            channel = {'id': uid(30 + k), 'device_id': self.device['id'], 'title': title,
                       'channel_key': key, 'value_type': 'text' if kind == 'rgb' else kind,
                       'unit': unit, 'direction': 'output' if output else 'input',
                       'config': {'io': io, 'physical_pin': f'GPIO{gpio}', 'virtual_pin': f'V{vpin}'}}
            self.channels.append(channel)
            if not output:
                for j in range(5):
                    self.telemetry.append({'id': uid(100 + k * 10 + j), 'channel_id': channel['id'],
                                           'recorded_at': stamp(1800 + 60 * j), 'received_at': stamp(4),
                                           'quality': 'ok', 'value_num': value + j, 'value_bool': None,
                                           'value_text': None})
            widgets.append({'id': uid(50 + k), 'type': widget, 'title': title, 'width': 'half',
                            'device_id': self.device['id'], 'channel_id': channel['id'],
                            'aggregation': 'latest', 'size':{'columns': 6 if output else 4,'height':0}, **({'min': 0, 'max': 100} if widget == 'progress' else {})})
        self.record = {'id': self.project, 'project_id': self.project, 'widget_type': 'note',
                       'title': 'Project dashboard', 'revision': 1,
                       'config': {'kind': 'dashboard_layout', 'schema_version': 3, 'widgets': widgets,
                                  'custom_phone_layout': False, 'theme': 'mint'}}
        self.events=[{'id':uid(200), 'device_id':self.device['id'], 'title':'Humidity above target',
                      'severity':'warning','event_type':'cloud_threshold',
                      'occurred_at':stamp(360), 'received_at':stamp(359), 'acknowledged_at':None,'detail':{}}]
        self.rules=[]
        self.commands={}
        self.command_posts=[]
        self.command_mode='disabled'
        self.polls={}
        self.violations,self.writes=[],[]

    def handle(self, route):
        url, method = route.request.url, route.request.method
        if url.startswith(SITE):
            path = (DOCS / unquote(urlsplit(url).path.removeprefix('/Robosync/') or 'index.html')).resolve()
            if path.is_relative_to(DOCS) and path.is_file():
                mime = 'text/javascript' if path.suffix == '.js' else guess_type(path)[0] or 'text/plain'
                return route.fulfill(path=path, content_type=mime)
            return route.fulfill(status=404, body='Missing fixture asset')
        if not url.startswith(BACKEND + '/'):
            return route.abort()
        path = urlsplit(url).path
        params = {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}
        request = route.request
        data = json.loads(request.post_data or '{}')
        session = request.headers.get('authorization', '').removeprefix('Bearer mock-')
        user = next((u for u in self.users.values() if u['id'] == session), None)

        def response(value, status=200):
            return route.fulfill(status=status, json=value,
                                 headers={'access-control-allow-origin': SITE.split('/Robosync/')[0]})

        if method == 'OPTIONS':
            return route.fulfill(status=204, headers={
                'access-control-allow-origin': SITE.split('/Robosync/')[0],
                'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
                'access-control-allow-headers': 'apikey, authorization, content-type, prefer, accept'
            })
        if path == '/auth/v1/settings':
            return response({'external': {'email': True}})
        if path == '/auth/v1/token' and data.get('password') == 'fixture-only':
            account = self.users[data['email']]
            return response({'access_token': 'mock-' + account['id'], 'refresh_token': 'mock-refresh',
                             'expires_in': 3600, 'user': account})
        if not user:
            return response({}, 401)
        if path == '/auth/v1/user':
            return response(user)
        if path == '/auth/v1/logout':
            return response({})
        table = path.removeprefix('/rest/v1/')
        owner = user['id'] == self.projects[0]['owner_id']
        if table == 'rpc/rs_pairing_connections' and owner and data.get('p_project_id') == self.project:
            return response([{'id':uid(201),'device_label':'Test phone','can_arrange':True,
                              'created_at':stamp(3600),'expires_at':stamp(-3600),'last_used_at':stamp(60),'revoked_at':None}])
        if table == 'rpc/rs_phase4_status' and owner:
            return response({'installed':False,'version':1})
        if table == 'rpc/rs_command_request' and owner and self.command_mode != 'disabled':
            self.command_posts.append(deepcopy(data))
            assert data['p_boot'] == 'aabbccddaabbccdd'
            cmd={'id':data['p_id'],'device_id':self.device['id'],'channel_id':data['p_channel'],
                 'boot':data['p_boot'],'requested':data['p_value'],'deadline':data['p_deadline'],
                 'accepted_at':stamp(),'state':'accepted'}
            assert cmd['channel_id'] in [channel['id'] for channel in self.channels if channel['direction']=='output']
            self.commands[cmd['id']] = (deepcopy(cmd),self.command_mode)
            return response(cmd)
        if table == 'rpc/rs_command_status' and owner and data.get('p_command') in self.commands:
            key=data['p_command']
            cmd,mode=self.commands[key]
            self.polls[key]=self.polls.get(key,0)+1
            if self.polls[key]==1:
                return response(cmd)
            result={'state':'applied','applied':cmd['requested']} if mode=='applied' else {}
            return response({**cmd,'state':mode,'result_at':stamp(),'result':result})
        if table == 'rpc/rs_command_cancel' and owner and self.commands:
            return response({})
        if table == 'rpc/rs_io_device_status' and owner and data.get('p_device') == self.device['id']:
            outputs = [{'pin': 13, 'driver': 'digital', 'operations': ['set']},
                       {'pin': 22, 'driver': 'rgb', 'pins': [22, 21, 19], 'operations': ['set']}]
            return response({'version': 1, 'device_id': self.device['id'], 'last_boot': 'aabbccddaabbccdd',
                             'last_contact':stamp(1),'last_upload':stamp(3),'backlog':22,
                             'reported':{'control_contact':stamp(1),'outputs':[],'upload':{'previous_http_code':200,'dropped_newest':0}},
                             'capabilities': {'kind': 'robosynct-io', 'version': 1, 'board': 'esp32-devkit-v1',
                                              'virtual_pin_max': 254, 'operations': ['set'], 'outputs': outputs,
                                              'executors': {'version': 1, 'rgb': True}}})
        if table == 'widgets' and method == 'PATCH' and owner:
            if params.get('revision') == 'eq.' + str(self.record['revision']) and params.get('id') == 'eq.' + self.project and params.get('project_id') == 'eq.' + self.project:
                self.writes.append('layout'); self.record.update(deepcopy(data))
            return response(None)
        if method != 'GET':
            if table in {'rpc/rs_cloud_status', 'rpc/rs_cloud_device_status', 'rpc/rs_cloud_rule_list', 'rpc/rs_pairing_connections', 'rpc/rs_access_status'}:
                return response([])
            self.violations.append((method, table))
            return response({'message': 'Unexpected mutation or RPC in browser test'}, 405)
        tables = {'profiles': [{'id': user['id']}], 'projects': [p for p in self.projects if p['owner_id'] == user['id']],
                  'devices': [self.device] if owner else [], 'channels': self.channels if owner else [],
                  'widgets': [self.record] if owner else [], 'telemetry': self.telemetry if owner else [],
                  'events': self.events if owner else [], 'rules': self.rules if owner else []}
        rows = tables.get(table, [])
        for key, value in params.items():
            if value.startswith('eq.'):
                rows=[r for r in rows if str(r.get(key))==value[3:]]
            elif value.startswith('in.('):
                rows=[r for r in rows if str(r.get(key)) in value[4:-1].split(',')]
            elif key=='or':
                # The Analytics keyset uses a strictly earlier (timestamp, UUID).
                match=re.match(r'[(](recorded_at|occurred_at)[.]lt[.]"([^"]+)".*id[.]lt[.]"([^"]+)"',value)
                if match:
                    field,instant,identifier=match.groups()
                    rows=[r for r in rows if (r[field],r['id'])<(instant,identifier)]
        if 'order' in params:
            key, _, order = params['order'].split(',')[0].partition('.')
            rows = sorted(rows, key=lambda r: str(r.get(key, '')), reverse=(order == 'desc'))
        return response(rows[:int(params.get('limit', 1000))])


def login(page, email):
    page.locator('#email').fill(email + '@example.invalid')
    page.locator('#password').fill('fixture-only')
    page.locator('#signin-button').click()
    expect(page.locator('#workspace-screen')).to_be_visible()


def open_project(page, title):
    card = page.locator('#project-grid article').filter(has_text=title)
    card.get_by_role('button', name=re.compile('(?:View|Open).*project', re.I)).click()
    expect(page.locator('#project-workspace-title')).to_have_text(title)


def dashboard(page):
    page.locator('#easy-nav-dashboard').click()
    expect(page.locator('#dashboard-edit')).to_be_enabled()


def exercise(browser, screenshot_dir=None):
    fixture = Workspace()
    context = browser.new_context(viewport={'width': 1440, 'height': 960}, reduced_motion='reduce', service_workers='block', accept_downloads=True)
    # Resolve all assets from the checkout and whitelist mock operations. There is no network fallback.
    context.route('**/*', fixture.handle)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_default_timeout(7500)
    page.goto(SITE)
    page.locator('#login-theme-button').click()
    page.get_by_role('button', name='Use Midnight theme').click()
    expect(page.locator('html')).to_have_attribute('data-theme', 'midnight')
    page.get_by_role('button', name='Use Mint theme').click()
    page.locator('#theme-dialog').press('Escape')
    login(page,'student')
    expect(page.locator('#overview-online')).to_have_text('1')
    expect(page.locator('#overview-control')).to_have_text('1 with recent control contact')
    expect(page.locator('#overview-backlog')).to_have_text('22')
    expect(page.locator('#overview-alerts')).to_contain_text('Humidity above target')
    if screenshot_dir:
        page.screenshot(path=screenshot_dir/'RoboSynct_V3_Desktop_Overview.png')
    open_project(page,'Greenhouse Lab')
    expect(page.locator('#device-list')).to_contain_text('Greenhouse ESP32')
    page.locator('#device-search').fill('no matches')
    expect(page.locator('#device-no-matches')).to_be_visible()
    page.locator('#clear-device-search').click()
    page.locator('#device-filter-status').select_option('online')
    expect(page.locator('#device-list')).to_contain_text('Greenhouse ESP32')
    page.get_by_role('button',name='Device details for Greenhouse ESP32').click()
    expect(page.locator('#directory-rows')).to_contain_text('27.4')
    page.locator('#directory-search').fill('V8')
    expect(page.locator('#directory-rows')).to_contain_text('GPIO22 / GPIO21 / GPIO19')
    expect(page.locator('#directory-rows')).not_to_contain_text('Temperature')
    page.locator('#easy-nav-activity').click()
    expect(page.locator('#event-list')).to_contain_text('Humidity above target')
    page.locator('#nav-automations').click()
    page.locator('#rules-add').click()
    for _ in range(5):
        page.locator('#rule-step-next').click()
    expect(page.locator('#rule-step-progress')).to_contain_text('Review')
    expect(page.locator('#rule-explanation')).to_contain_text('warning')
    page.locator('#rule-dialog').press('Escape')
    page.locator('#nav-phone').click()
    expect(page.locator('#phone-recent-contact')).to_contain_text('1 paired')
    expect(page.locator('#phone-saved-layout')).to_contain_text('5 widgets')
    page.locator('#qr-dialog').press('Escape')
    page.locator('#easy-nav-devices').click()
    page.locator('#add-device-button').click()
    expect(page.locator('#connect-guide-title')).to_have_text('Choose board')
    page.locator('#connect-guide-next').click()
    expect(page.locator('#connect-guide-title')).to_have_text('Select connection')
    page.locator('#connect-guide-next').click()
    expect(page.locator('#connect-guide-title')).to_have_text('Configure')
    page.locator('#connect-guide-next').click()
    expect(page.locator('#connect-guide-title')).to_have_text('Verify')
    page.get_by_role('button',name='Check saved data').click()
    expect(page.locator('#connect-guide-content')).to_contain_text('Last confirmed sensor upload')
    page.locator('#connect-guide-next').click()
    expect(page.locator('#connect-guide-title')).to_have_text('Finish')
    page.locator('#connect-guide-next').click()
    expect(page.locator('#dashboard-edit')).to_be_enabled()
    page.locator('.console-tools summary').click()
    page.locator('#nav-analytics').click()
    page.locator('#analytics-apply').click()
    expect(page.locator('#analytics-charts')).to_contain_text('uploaded')
    with page.expect_download() as download:
        page.locator('#analytics-csv').click()
    assert 'received_at_utc' in download.value.path().read_text(encoding='utf-8-sig')
    dashboard(page)
    canvas = page.locator('#dashboard-canvas')
    expect(canvas).to_contain_text('27.4')
    expect(canvas).to_contain_text('RGB LED')
    expect(canvas.get_by_role('button', name='Turn On', exact=True)).to_be_enabled()
    # Changing the RGB draft and merely visiting/editing a relay must not dispatch.
    red = canvas.get_by_role('slider', name='Red', exact=True)
    red.focus(); red.press('ArrowRight')
    expect(red).to_have_value('1')
    page.locator('#dashboard-edit').click()
    page.locator('#dashboard-sections').click()
    page.get_by_role('textbox',name='New section name').fill('Lab space')
    page.get_by_role('button',name='Add section',exact=True).click()
    page.get_by_role('button',name='Done',exact=True).click()
    page.locator('#dashboard-add').click()
    page.locator('#widget-type').select_option('note')
    page.locator('#widget-title').fill('Lab log')
    page.locator('#widget-note').fill('Classroom observations')
    page.locator('#widget-section').select_option(label='Lab space')
    page.locator('#widget-apply').click()
    expect(page.locator('#widget-dialog')).not_to_be_visible()
    canvas.get_by_role('button', name='Move Lab log earlier', exact=True).click()
    resize = canvas.get_by_role('button', name=re.compile('^Resize Lab log'))
    resize.press('ArrowRight')
    canvas.get_by_role('button', name='Edit Lab log', exact=True).click()
    page.locator('#widget-title').fill('Lab notes')
    page.locator('#widget-apply').click()
    page.locator('#dashboard-phone-preview').click()
    expect(page.locator('#dashboard-canvas')).to_have_class(re.compile(r'phone-layout-canvas'))
    page.locator('#dashboard-phone-preview').click()
    page.locator('#dashboard-save').click()
    expect(page.locator('#dashboard-save-state')).to_contain_text('Saved')
    assert fixture.writes == ['layout']
    saved = fixture.record['config']['widgets']
    assert saved[-2]['title']=='Lab notes' and saved[-2]['size']['columns']==7
    assert fixture.record['config']['navigation']['tabs'][0]['key']==saved[-2]['tab']
    assert [w['channel_id'] for w in saved if 'channel_id' in w] == [c['id'] for c in fixture.channels]
    page.reload()
    expect(page.locator('#workspace-screen')).to_be_visible()
    open_project(page, 'Greenhouse Lab')
    dashboard(page)
    expect(canvas).to_contain_text('Classroom observations')
    page.get_by_role('tab',name='Lab space',exact=True).click()
    expect(canvas).not_to_contain_text('Temperature')
    page.get_by_role('tab',name='All',exact=True).click()
    expect(canvas).to_contain_text('Temperature')
    page.locator('#dashboard-edit').click()
    canvas.get_by_role('button', name='Remove Lab notes', exact=True).click()
    expect(canvas).not_to_contain_text('Classroom observations')
    page.locator('#dashboard-discard').click()
    expect(canvas).to_contain_text('Classroom observations')
    context.set_offline(True)
    expect(page.locator('#offline-banner')).to_be_visible()
    context.set_offline(False)
    expect(page.locator('#offline-banner')).not_to_be_visible()
    assert fixture.writes == ['layout'] and not fixture.command_posts and not fixture.violations, fixture.violations
    # Explicit fake-only relay and color requests. All traffic remains inside this fixture.
    relay=canvas.locator('article').filter(has=page.get_by_role('heading',name='Relay',exact=True))
    rgb=canvas.locator('article').filter(has=page.get_by_role('heading',name='RGB LED',exact=True))
    fixture.command_mode='applied'
    relay.get_by_role('button',name='Turn On',exact=True).click()
    expect(relay.locator('.command-result')).to_have_text('Applied and acknowledged')
    expect(relay.locator('.output-values dd').last).to_have_text('On')
    assert fixture.command_posts[-1]['p_value'] is True
    fixture.command_mode='expired'
    relay.get_by_role('button',name='Turn Off',exact=True).click()
    expect(relay.locator('.command-result')).to_have_text('Expired')
    expect(relay.locator('.output-values dd').last).to_have_text('On')
    assert fixture.command_posts[-1]['p_value'] is False
    fixture.command_mode='applied'
    rgb.get_by_label('Red',exact=True).fill('45')
    assert len(fixture.command_posts)==2
    rgb.get_by_role('button',name='Apply RGB',exact=True).click()
    expect(rgb.locator('.command-result')).to_have_text('Applied and acknowledged')
    expect(rgb.locator('.output-values dd').last).to_have_text('#2D0000')
    assert fixture.command_posts[-1]['p_value']==[45,0,0]
    assert len(fixture.command_posts)==3 and not fixture.violations
    if screenshot_dir:
        page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=screenshot_dir/'RoboSynct_V3_Desktop_Dashboard.png',full_page=True)
    # Client isolation: log out and sign in as a second fictitious account in the same tab.
    page.locator('#signout-button').click()
    expect(page.locator('#login-screen')).to_be_visible()
    login(page, 'visitor')
    expect(page.locator('#project-grid')).to_contain_text('Visitor Lab')
    expect(page.locator('#project-grid')).not_to_contain_text('Greenhouse Lab')
    expect(page.locator('#project-workspace')).not_to_be_visible()
    assert not errors, errors
    # Studio must reject an explicit project belonging to the other mock account.
    page.goto(SITE+'studio.html?project='+fixture.project)
    expect(page.locator('#status')).to_contain_text('unavailable to the signed-in account')
    assert not errors and not fixture.violations, (errors,fixture.violations)
    context.close()

    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,
                               reduced_motion='reduce',service_workers='block')
    mobile_fixture=Workspace()
    mobile.route('**/*',mobile_fixture.handle)
    phone=mobile.new_page()
    phone.goto(SITE)
    login(phone,'student')
    expect(phone.locator('#overview-backlog')).to_have_text('22')
    if screenshot_dir:
        phone.screenshot(path=screenshot_dir/'RoboSynct_V3_Phone_Overview.png',full_page=True)
    phone.locator('#console-menu').click()
    dashboard(phone)
    expect(phone.locator('#dashboard-canvas')).to_contain_text('Sound activity')
    expect(phone.get_by_role('button',name='Apply RGB')).to_be_enabled()
    phone.get_by_role('heading',name='Relay',exact=True).scroll_into_view_if_needed()
    assert phone.evaluate('document.documentElement.scrollWidth === window.innerWidth')
    if screenshot_dir:
        phone.evaluate('window.scrollTo(0,0)')
        phone.screenshot(path=screenshot_dir/'RoboSynct_V3_Phone_Dashboard.png',full_page=True)
    assert not mobile_fixture.command_posts and not mobile_fixture.violations
    mobile.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium', default=which('chromium') or which('google-chrome'), help='Chromium executable; defaults to system or Playwright installation')
    parser.add_argument('--screenshots',type=Path,help='Save desktop and phone previews from mock data')
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chromium)
        try:
            exercise(browser,args.screenshots)
        finally:
            browser.close()
    print('Passed browser smoke: account isolation, desktop and phone UI, board setup, datastreams, saved history/CSV, events, Phone Sync, layout edits, reconnect and relay/RGB acknowledgment and expiry. All cloud and board replies were simulated.')
