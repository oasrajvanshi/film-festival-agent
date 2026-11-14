"""Agent architecture boards for the two scenarios (snow, a late key guest).

Visual language from the prototype's Architecture board (sources with their
APIs, live-picture hub, one lane per interface, numbered steps, model and tool
chips, orange where a person decides) plus real branches and loops.

    python3 docs/infographic/build_architecture.py      # writes backend-infographic.html
"""
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
W = 1600
INK, MUTED, LINE = '#18181B', '#55555C', '#D9D9D3'
BLUE, ORANGE, RED = '#2563EB', '#D9730D', '#B54A3F'

I = {
 'cloud': '<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5A3.8 3.8 0 0 1 17.5 18z"/>',
 'bus': '<rect x="5" y="4" width="14" height="13" rx="3"/><path d="M5 11h14M8 20v-3M16 20v-3"/>',
 'cal': '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
 'ticket': '<path d="M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 0 0-4V5H4z"/><path d="M14 5v11"/>',
 'mail': '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
 'chat': '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17H10l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z"/>',
 'door': '<path d="M5 20V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v15M3 20h18"/><circle cx="15" cy="12.5" r="0.9"/>',
 'plane': '<path d="M3 13.5l7-1.5 4-7.5 2 .5-2 7.5 5.5 1.5 1.5-2 1.5.5-1 4-1.5.5-6-1-3 6-2-.5 1-6-6-1z"/>',
 'db': '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
 'person': '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
 'people': '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 19"/>',
 'phone': '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
 'cpu': '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v3M14 3v3M10 18v3M14 18v3M3 10h3M3 14h3M18 10h3M18 14h3"/>',
 'plug': '<path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5V21"/>',
 'clock': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
}
def ic(k, sz=16):
    return f'<svg class="ic" width="{sz}" height="{sz}" viewBox="0 0 24 24" aria-hidden="true">{I[k]}</svg>'
def M(t='qwen3:8b'): return f'<span class="ch ml">{ic("cpu",13)}{t}</span>'
def T(t): return f'<span class="ch tl">{t}</span>'
def S(t): return f'<span class="ch sv">{ic("plug",13)}{t}</span>'
def R(t='Rules'): return f'<span class="ch rl">{t}</span>'
def O(t): return f'<span class="ch op">{t}</span>'

EDGE = {  # colour, width, dash, marker
 'main': (INK, 1.7, '', 'ah'), 'data': (BLUE, 1.5, '3 4', 'ahb'), 'loop': (ORANGE, 1.6, '6 4', 'aho'), 'stop': (RED, 1.5, '4 4', 'ahr'),
}

class Board:
    def __init__(self, bid, title, height):
        self.id, self.title, self.H = bid, title, height
        self.nodes, self.parts, self.edges, self.labels, self.lanes = {}, [], [], [], []

    def _add(self, id, x, y, w, h, html, kind='box'):
        self.nodes[id] = dict(x=x, y=y, w=w, h=h, kind=kind)
        self.parts.append(html)

    def lane(self, x, y, w, h, icon, name, sub=''):
        s = f' <span class="lns">· {sub}</span>' if sub else ''
        self.lanes.append(f'<div class="lane" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px"></div>'
                          f'<p class="ln" style="left:{x + 20}px;top:{y + 14}px">{ic(icon, 17)}{name}{s}</p>')

    def sources(self, id, x, y, w, h, title, items):
        li = ''.join(f'<div class="si">{ic(k, 18)}<span><b>{t}</b><span class="src">{src}</span></span></div>' for k, t, src in items)
        self._add(id, x, y, w, h, f'<div class="nd data" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px"><p class="nt">{title}</p><div class="sl">{li}</div></div>')

    def hub(self, id, x, y, w, h):
        self._add(id, x, y, w, h, f'<div class="hub" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px">{ic("db", 30)}'
                  f'<p class="ht">Live festival picture</p><p class="hx">conditions<br>decisions<br>timers</p></div>')

    def step(self, id, x, y, w, h, num, title, chips='', sub='', cls=''):
        badge = f'<span class="nb">{num}</span>' if num else ''
        who = f'<span class="who">{ic("person", 17)}</span>' if cls == 'hu' else ''
        sb = f'<p class="nx">{sub}</p>' if sub else ''
        ch = f'<div class="chs">{chips}</div>' if chips else ''
        self._add(id, x, y, w, h, f'<div class="nd {cls}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px">'
                  f'<div class="nh">{badge}<span class="nt">{title}</span>{who}</div>{sb}{ch}</div>')

    def out(self, id, x, y, w, h, icon, title, chips=''):
        self._add(id, x, y, w, h, f'<div class="nd out" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px">'
                  f'<div class="nh">{ic(icon, 16)}<span class="nt">{title}</span></div><div class="chs">{chips}</div></div>')

    def pill(self, id, x, y, w, h, text, tone=''):
        self._add(id, x, y, w, h, f'<div class="pl {tone}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px">{text}</div>')

    def diamond(self, id, cx, cy, num, text):
        self.nodes[id] = dict(x=cx - 52, y=cy - 52, w=104, h=104, kind='diamond')
        self.parts.append(f'<div class="dm" style="left:{cx - 37}px;top:{cy - 37}px"></div>'
                          f'<span class="nb dmb" style="left:{cx - 11}px;top:{cy - 74}px">{num}</span>'
                          f'<p class="dmt" style="left:{cx - 48}px;top:{cy - 22}px">{text}</p>')

    def anchor(self, id, side, d=0):
        n = self.nodes[id]
        x, y, w, h = n['x'], n['y'], n['w'], n['h']
        return {'t': (x + w / 2 + d, y), 'b': (x + w / 2 + d, y + h), 'l': (x, y + h / 2 + d), 'r': (x + w, y + h / 2 + d)}[side]

    def edge(self, a, b, style='main', fs='r', ts='l', pts=(), fd=0, td=0, label=None, at=None):
        p0, p1 = self.anchor(a, fs, fd), self.anchor(b, ts, td)
        path = [p0, *pts, p1]
        if not pts and p0[0] != p1[0] and p0[1] != p1[1]:   # elbow
            path = [p0, ((p0[0] + p1[0]) / 2, p0[1]), ((p0[0] + p1[0]) / 2, p1[1]), p1] if fs in 'lr' and ts in 'lr' else \
                   [p0, (p0[0], (p0[1] + p1[1]) / 2), (p1[0], (p0[1] + p1[1]) / 2), p1] if fs in 'tb' and ts in 'tb' else \
                   [p0, (p1[0], p0[1]), p1] if fs in 'lr' else [p0, (p0[0], p1[1]), p1]
        self.edges.append((style, path))
        if label: self.labels.append((at, label, style))

    def raw(self, style, path, label=None, at=None):
        self.edges.append((style, path))
        if label: self.labels.append((at, label, style))

    def html(self):
        defs = ''.join(f'<marker id="{m}-{self.id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9 z" fill="{c}"/></marker>'
                       for c, _, _, m in EDGE.values())
        paths = ''.join(f'<path d="M{" L".join(f"{x:.0f} {y:.0f}" for x, y in p)}" fill="none" stroke="{EDGE[s][0]}" stroke-width="{EDGE[s][1]}"'
                        + (f' stroke-dasharray="{EDGE[s][2]}"' if EDGE[s][2] else '') + f' stroke-linejoin="round" marker-end="url(#{EDGE[s][3]}-{self.id})"/>'
                        for s, p in self.edges)
        wires = f'<svg class="wires" width="{W}" height="{self.H}" viewBox="0 0 {W} {self.H}" aria-hidden="true"><defs>{defs}</defs>{paths}</svg>'
        labs = ''.join(f'<span class="al {s}" style="left:{x}px;top:{y}px">{t}</span>' for (x, y), t, s in self.labels)
        legend = ('<div class="leg">'
                  '<span><i class="lg data"></i>Outside source</span><span><i class="lg step"></i>Agent step</span>'
                  '<span><i class="lg dia"></i>Decision</span><span><i class="lg hu"></i>A person decides</span>'
                  '<span><i class="lg out"></i>Gets a message</span>'
                  f'<span class="ch ml">{ic("cpu", 13)}AI model</span><span class="ch tl">agent tool</span>'
                  f'<span class="ch sv">{ic("plug", 13)}Service</span><span class="ch rl">Rules</span>'
                  '<span><i class="lw" style="border-color:#2563EB;border-top-style:dotted"></i>Feeds</span>'
                  '<span><i class="lw" style="border-color:#D9730D;border-top-style:dashed"></i>Loop, timer</span>'
                  '<span><i class="lw" style="border-color:#B54A3F;border-top-style:dashed"></i>Stops</span></div>')
        head = f'<p class="bt">{self.title}</p>'
        return f'<div class="bd" id="{self.id}" style="height:{self.H}px">{head}{legend}{"".join(self.lanes)}{wires}{"".join(self.parts)}{labs}</div>'


# ------------------------------------------------------------------ Scenario 1: snow
SRC_X, SRC_W, HUB_X, HUB_W, LANE_X, LANE_W = 24, 250, 296, 120, 440, 1136

def frame(b, items):
    b.lane(LANE_X, 130, LANE_W, 480, 'people', 'Ops dashboard', 'manager and staff')
    b.lane(LANE_X, 630, LANE_W, 240, 'phone', 'Attendee app')
    b.sources('src', SRC_X, 130, SRC_W, 480, 'Outside sources', items)
    b.sources('src2', SRC_X, 630, SRC_W, 240, 'From the app', [('ticket', 'Saved plans, tickets', 'Attendee app')])
    b.hub('hub', HUB_X, 130, HUB_W, 740)
    b.edge('src', 'hub', 'data', td=-130)
    b.edge('src2', 'hub', 'data', td=250)
    b.edge('hub', 'sort', fd=-180)


def snow():
    b = Board('snow', 'Scenario 1 · Snow', 900)
    b.step('sort', 460, 268, 168, 104, '1', 'Sort the event', R('Router: rules'))
    frame(b, [
        ('cloud', 'Weather forecast', 'Open-Meteo API'),
        ('bus', 'Shuttle delays', 'Shuttle GPS feed'),
        ('cal', 'Schedule, people, shifts', 'Google Sheet'),
        ('clock', 'Re-check timers', 'Backend scheduler')])
    b.step('desk', 660, 228, 262, 184, '2', 'Weather desk', M() + T('get_forecast') + T('get_shuttle_status') + T('list_sessions') + T('plan_weather_options') + T('submit_decision'))
    b.diamond('over', 1000, 320, '3', 'Over 2 in<br>of snow?')
    b.pill('watch', 945, 434, 110, 38, 'Watch only')
    b.step('brief', 1098, 168, 240, 92, '4', 'Door and driver briefs', R('runs on its own'))
    b.step('bus', 1098, 274, 240, 92, '4', 'Extra bus?', S('Ops dashboard'), sub='Operations decides', cls='hu')
    b.step('notice', 1098, 380, 240, 92, '4', 'Weather notice', S('Ops dashboard'), sub='Comms decides', cls='hu')
    b.out('vol', 1370, 168, 190, 92, 'people', 'Volunteers', S('Email') + S('Push'))
    b.out('vendor', 1370, 274, 190, 92, 'bus', 'Shuttle vendor', S('Email'))
    b.pill('safe', 1370, 400, 190, 52, 'No answer:<br>safe default', 'stop')
    b.pill('guests', 660, 478, 262, 40, 'Re-check guests on the road → Scenario 2', 'link')
    b.step('arrive', 1098, 712, 240, 96, '', 'Notice on their phone', S('Push') + S('SMS'))
    b.step('plans', 660, 712, 262, 96, '', 'Saved plans', sub='who moves between venues')

    b.edge('sort', 'desk')
    b.edge('desk', 'over')
    b.edge('over', 'watch', fs='b', ts='t', label='no', at=(1008, 390))
    b.raw('main', [(1052, 320), (1080, 320), (1080, 214), (1098, 214)], 'yes', (1053, 292))
    b.raw('main', [(1080, 320), (1098, 320)])
    b.raw('main', [(1080, 320), (1080, 426), (1098, 426)])
    b.edge('brief', 'vol')
    b.edge('bus', 'vendor')
    b.edge('notice', 'safe', 'stop')
    b.edge('notice', 'arrive', fs='b', ts='t', label='approve', at=(1226, 560))
    b.edge('desk', 'guests', fs='b', ts='t')
    b.raw('loop', [(1000, 472), (1000, 575), (416, 575)], 're-check timer', (700, 556))
    b.edge('plans', 'hub', 'loop', fs='l', ts='r', td=260, label='plans give shuttle riders', at=(450, 738))
    return b


# ------------------------------------------------------------------ Scenario 2: a key guest is late
def late():
    b = Board('late', 'Scenario 2 · A key guest is late', 900)
    b.step('sort', 460, 260, 170, 120, '1', 'Sort the event', R('Router') + M())
    frame(b, [
        ('plane', 'Flight status', 'FlightAware API'),
        ('mail', 'Guest or assistant email', 'Gmail API'),
        ('chat', 'Guest SMS', 'Twilio'),
        ('door', 'Check-ins', 'QR door scans'),
        ('cal', 'Call sheet, guest list', 'Google Sheet'),
        ('cloud', 'Snow travel time', 'Scenario 1')])
    b.diamond('known', 702, 320, '2', 'Sender on<br>the sheet?')
    b.step('person', 622, 448, 160, 70, '', 'A person reads it', cls='hu')
    b.step('desk', 790, 213, 262, 214, '3', 'Talent desk', M() + T('get_guest') + T('get_flight_status') + T('estimate_guest_eta') + T('find_backups') + T('check_delay_impact') + T('plan_guest_options'))
    b.diamond('make', 1126, 320, '4', 'Makes the<br>call?')
    b.pill('ok', 1076, 160, 100, 36, 'No action')
    b.step('decide', 1210, 222, 170, 196, '5', 'Guest relations decides', O('brief a backup') + O('start with backup') + O('delay') + O('video'), cls='hu')
    b.out('backup', 1398, 157, 168, 92, 'person', 'Backup speaker', S('SMS'))
    b.out('guest', 1398, 274, 168, 92, 'person', 'Guest, assistant', S('Email'))
    b.out('house', 1398, 391, 168, 92, 'people', 'House managers', S('Slack'))
    b.pill('ops', 1398, 500, 168, 52, 'No answer:<br>page Operations', 'stop')
    b.step('plan', 1210, 712, 170, 96, '', 'Plan update', S('Push'))
    b.step('plans', 790, 712, 262, 96, '', 'Saved plans', sub='who would wait')

    b.edge('sort', 'known')
    b.edge('known', 'desk', label='yes', at=(760, 300))
    b.edge('known', 'person', 'stop', fs='b', ts='t', label='no', at=(710, 390))
    b.raw('loop', [(1020, 213), (1020, 189), (830, 189), (830, 213)], 'bad tool call: retry', (850, 167))
    b.edge('desk', 'make')
    b.edge('make', 'ok', fs='t', ts='b', label='on time', at=(1134, 220))
    b.edge('make', 'decide', label='late', at=(1176, 296))
    b.edge('decide', 'guest')
    b.raw('main', [(1388, 320), (1388, 203), (1398, 203)])
    b.raw('main', [(1388, 320), (1388, 437), (1398, 437)])
    b.raw('stop', [(1335, 418), (1335, 526), (1398, 526)])
    b.edge('decide', 'plan', fs='b', ts='t', fd=-40, td=-40, label='only if delayed', at=(1263, 600))
    b.edge('plans', 'hub', 'loop', fs='l', ts='r', td=260, label='plans show who would wait', at=(450, 738))
    return b


CSS = '''
:root { --bg: #F4F4F1; --ink: #18181B; --muted: #55555C; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #141416; --ink: #EDEDF0; --muted: #B4B4BC; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #141416; --ink: #EDEDF0; --muted: #B4B4BC; color-scheme: dark }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
p { margin: 0; }
.page { max-width: 1640px; margin: 0 auto; padding-block: 32px 48px; display: grid; gap: 28px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.page > header h1 { font-size: clamp(28px, 4vw, 40px); line-height: 1.1; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.page > header p { color: var(--muted); font-size: 16px; margin-top: 6px; }
.stage { overflow-x: auto; border-radius: 22px; }
.bd { --z: 1; zoom: var(--z); position: relative; width: 1600px; background: #F1F1EE; border-radius: 22px; overflow: hidden; color: #18181B; }
.bt { position: absolute; left: 24px; top: 22px; font-size: 26px; line-height: 32px; font-weight: 600; }
.ic { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.lane { position: absolute; border-radius: 22px; background: #fff; }
.ln { position: absolute; display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; color: #C2410C; }
.lns { font-weight: 500; color: #55555C; }
.wires { position: absolute; left: 0; top: 0; overflow: visible; }
.nd { position: absolute; display: flex; flex-direction: column; gap: 8px; padding: 13px 14px; border-radius: 16px; background: #fff; box-shadow: inset 0 0 0 1.5px #CFCFC8; }
.nd.data { background: #E9E9E4; box-shadow: none; gap: 14px; padding: 16px; }
.nd.hu { background: #FFF6F0; box-shadow: inset 0 0 0 1.5px #E9A27A; }
.nd.out { background: #FAFAF7; box-shadow: none; outline: 1.5px dashed #8A8A91; outline-offset: -1.5px; }
.nh { display: flex; align-items: center; gap: 8px; }
.nb { width: 22px; height: 22px; border-radius: 999px; background: #D9730D; color: #fff; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.nt { font-size: 15.5px; line-height: 21px; font-weight: 700; }
.nx { font-size: 13.5px; line-height: 18px; color: #55555C; }
.who { margin-left: auto; display: inline-flex; color: #9A3412; }
.chs { display: flex; flex-wrap: wrap; gap: 5px; margin-top: auto; }
.ch { display: inline-flex; align-items: center; gap: 5px; height: 23px; padding: 0 7px; border-radius: 7px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.ch.ml { background: #EEE9FB; color: #4C2A9E; }
.ch.tl { background: #EEF3FE; color: #2563EB; font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-size: 11.5px; font-weight: 700; }
.ch.sv { background: #fff; color: #3F3F46; box-shadow: inset 0 0 0 1px #CFCFC8; }
.ch.rl { background: #EFEFEB; color: #55555C; }
.ch.op { background: #fff; color: #9A3412; box-shadow: inset 0 0 0 1px #E9A27A; }
.sl { display: flex; flex-direction: column; gap: 14px; }
.si { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; line-height: 19px; }
.si svg { color: #3F3F46; margin-top: 1px; }
.si b { display: block; font-weight: 600; }
.src { display: block; font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-size: 12px; font-weight: 700; color: #2563EB; margin-top: 2px; }
.hub { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 16px 12px; border-radius: 20px; background: #1C1B1F; color: #fff; text-align: center; }
.hub svg { color: #F4874B; }
.ht { font-size: 16px; line-height: 22px; font-weight: 700; }
.hx { font-size: 13.5px; line-height: 21px; color: #C9C9CF; }
.dm { position: absolute; width: 74px; height: 74px; transform: rotate(45deg); border-radius: 12px; background: #fff; box-shadow: inset 0 0 0 1.5px #55555C; }
.dmb { position: absolute; }
.dmt { position: absolute; width: 96px; height: 44px; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 13px; line-height: 16px; font-weight: 700; color: #2563EB; }
.pl { position: absolute; display: flex; align-items: center; justify-content: center; text-align: center; border-radius: 999px; background: #fff; box-shadow: inset 0 0 0 1.5px #3F3F46; font-size: 13.5px; line-height: 17px; font-weight: 600; }
.pl.stop { color: #B54A3F; box-shadow: inset 0 0 0 1.5px #B54A3F; border-radius: 14px; }
.pl.link { color: #C2410C; background: #FFF6F0; box-shadow: inset 0 0 0 1.5px #E9A27A; }
.al { position: absolute; font-size: 13px; line-height: 17px; font-weight: 700; color: #2563EB; background: #fff; padding: 0 4px; border-radius: 4px; white-space: nowrap; }
.al.loop { color: #D9730D; } .al.stop { color: #B54A3F; }
.leg { position: absolute; left: 24px; top: 70px; right: 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; font-size: 13.5px; color: #3F3F46; }
.leg > span { display: inline-flex; align-items: center; gap: 7px; }
.lg { display: inline-block; width: 18px; height: 14px; border-radius: 4px; }
.lg.data { background: #E2E2DD; } .lg.step { background: #fff; box-shadow: inset 0 0 0 1.5px #B9B9B2; }
.lg.dia { width: 12px; height: 12px; transform: rotate(45deg); border-radius: 2px; background: #fff; box-shadow: inset 0 0 0 1.5px #55555C; margin: 0 3px; }
.lg.hu { background: #FFF6F0; box-shadow: inset 0 0 0 1.5px #E9A27A; } .lg.out { background: #FAFAF7; outline: 1.5px dashed #8A8A91; outline-offset: -1.5px; }
.lw { display: inline-block; width: 24px; height: 0; border-top: 2px solid; }
'''

FIT = '''
(function(){
  function fit(){ document.querySelectorAll('.stage').forEach(function(s){
    var z = Math.max(0.5, Math.min(1, s.clientWidth / 1600));
    s.firstElementChild.style.setProperty('--z', z); }); }
  window.addEventListener('resize', fit); fit();
})();
'''

def page():
    lve = pathlib.Path.home().joinpath('.claude/skills/html-live-editor/assets/live-editor.js').read_text().replace('</script', '<\\/script')
    boards = ''.join(f'<div class="stage">{b.html()}</div>' for b in (snow(), late()))
    return f'''<title>Harbor Lights Ops Agent</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@700&display=swap">
<style>{CSS}</style>
<div class="page">
  <header><h1>Harbor Lights Ops Agent</h1><p>Agent architecture for the two scenarios we test.</p></header>
  {boards}
</div>
<script>{FIT}</script>
<script>
{lve}
</script>
'''

if __name__ == '__main__':
    (HERE / 'backend-infographic.html').write_text(page())
    print('wrote', HERE / 'backend-infographic.html')
