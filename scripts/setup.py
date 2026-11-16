"""The home page cards and setup answers, from content/setup.yaml and the IRL Commons catalogue.

Blocks pick services by their catalogue fields; lines use the catalogue description unless the
block has a note for that service. `problems()` lists everything that should stop a build."""
import html, json, re, subprocess, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'shared'))
import render as r

KEYS = ('id', 'class', 'kind', 'role', 'hosting', 'part', 'platforms', 'tags')
LIST_FIELDS = {'part', 'platforms', 'tags'}


def load_yaml(path: pathlib.Path) -> dict:
    """Parsed with the `yaml` npm package, so the build needs no Python packages."""
    out = subprocess.run(['node', '--input-type=module', '-e',
                          'import {parse} from "yaml"; import {readFileSync} from "node:fs";'
                          'process.stdout.write(JSON.stringify(parse(readFileSync(process.argv[1], "utf8"))))', str(path)],
                         cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def allowed_values(schema: dict, services: list[dict]) -> dict[str, set]:
    """What each select key may say: the enums in the published JSON Schema, and the service ids."""
    props = schema['properties']['services']['items']['properties']
    def enum(p):
        p = props[p]
        p = p.get('items', p)
        for alt in p.get('anyOf', [p]):
            if 'enum' in alt:
                return set(alt['enum'])
        return set()
    allowed = {k: enum(k) for k in KEYS if k != 'id'}
    allowed['id'] = {s['id'] for s in services}
    return allowed


def as_list(v) -> list:
    return v if isinstance(v, list) else [v]


def fits(s: dict, match: dict) -> bool:
    for k, want in match.items():
        want = as_list(want)
        have = s.get(k)
        if k in LIST_FIELDS:
            if not set(want) & set(have):
                return False
        elif have not in want:
            return False
    return True


def selected(block: dict, services: list[dict]) -> list[dict]:
    return r.by_name(s for s in services if any(fits(s, m) for m in block.get('select', [])))


def problems(setup: dict, services: list[dict], allowed: dict[str, set]) -> list[str]:
    out = []
    by_id = {s['id']: s for s in services}
    tagged_home: dict[tuple[str, str], bool] = {}
    ids = {a['id'] for a in setup['answers']}
    for g in setup['groups']:
        for c in g['cards']:
            if 'to' in c and c['to'] not in ids:
                out.append(f'card "{c["title"]}": no answer #{c["to"]}')
    for a in setup['answers']:
        back = a.get('back')
        if isinstance(back, dict) and back.get('to') not in ids:
            out.append(f'#{a["id"]}: back link to #{back.get("to")}, which is no answer')
        elif back is not None and not isinstance(back, dict) and back != 'history':
            out.append(f'#{a["id"]}: back is "{back}" (use history or {{to: <answer id>, label: ...}})')
        for c in a.get('choices', []):
            if c['to'] not in ids:
                out.append(f'#{a["id"]}: choice "{c["title"]}": no answer #{c["to"]}')
        anchors = {b['anchor'] for b in a.get('blocks', []) if b.get('anchor')}
        if a.get('layout') not in (None, 'steps'):
            out.append(f'#{a["id"]}: layout "{a["layout"]}" (use steps, or leave it out)')
        for b in a.get('blocks', []):
            where = f'#{a["id"]} "{b["title"]}"'
            for p in b.get('split', []):
                if p not in PLATFORM_NAMES:
                    out.append(f'{where}: split by "{p}" (use {", ".join(PLATFORM_NAMES)})')
            for c in b.get('choose', []):
                go = c.get('go', {}).get('href', '')
                if go.startswith('#') and go[1:] not in anchors:
                    out.append(f'{where}: "{c["title"]}" jumps to {go}, which no block of this answer has as its anchor')
            for m in b.get('select', []):
                for k, v in m.items():
                    if k not in KEYS:
                        out.append(f'{where}: unknown field "{k}" (use {", ".join(KEYS)})')
                        continue
                    for x in as_list(v):
                        if x not in allowed[k]:
                            out.append(f'{where}: {k} "{x}" is not in IRL Commons')
            picked = selected(b, services)
            picked_ids = {s['id'] for s in picked}
            for sid in b.get('notes', {}):
                if sid not in picked_ids:
                    out.append(f'{where}: note for "{sid}", which this block no longer selects')
            if b.get('select') and not picked:
                out.append(f'{where}: selects no service')
            for m in b.get('select', []):
                for t in as_list(m.get('tags', [])):
                    for s in picked:
                        if t in s['tags'] and fits(s, m):
                            tagged_home[(s['id'], t)] = True
    for s in services:
        for t in s['tags']:
            if (s['id'], t) not in tagged_home:
                out.append(f'{s["name"]} ({s["id"]}) is tagged {t}, but no block that selects by {t} shows it')
    for text in texts(setup):
        for sid in re.findall(r'\{([a-z0-9-]+)\}', text):
            if sid not in by_id:
                out.append(f'{{{sid}}}: no such service in IRL Commons')
    return out


def texts(setup: dict):
    for a in setup['answers']:
        for b in a.get('blocks', []):
            if b.get('pre'):
                yield b['pre']
            yield from b.get('before', [])
            yield from b.get('after', [])
            yield from b.get('notes', {}).values()
            for c in b.get('choose', []):
                yield c['text']
                yield from c.get('items', [])


def link_services(text: str, by_id: dict) -> str:
    def one(m):
        s = by_id[m[1]]
        url = r.SITE_HOME[s['id']][0] if s['id'] in r.SITE_HOME else s['url']
        return f'<a href="{html.escape(url)}">{html.escape(s["name"], quote=False)}</a>'
    return re.sub(r'\{([a-z0-9-]+)\}', one, text)


def esc(t: str) -> str:
    return html.escape(t, quote=False)


def card(c: dict) -> str:
    href = c.get('href') or f'#{c["to"]}'
    return (f'<li><a href="{href}"><svg class="ill" aria-hidden="true"><use href="#{c["icon"]}"/></svg>'
            f'<strong>{esc(c["title"])}</strong><span>{esc(c["text"])}</span></a></li>')


def home_html(setup: dict) -> str:
    parts = []
    for i, g in enumerate(setup['groups']):
        gid = 'grp-' + re.sub('[^a-z0-9]+', '-', g['title'].lower()).strip('-')
        cls = 'choices' + (' learn' if g.get('style') == 'learn' else '')
        cards = '\n          '.join(card(c) for c in g['cards'])
        anchor = f' id="{g["anchor"]}"' if g.get('anchor') else ''
        parts.append(f'<h2 class="grp" id="{gid}" data-permalink="no">{esc(g["title"])}</h2>\n'
                     f'        <ul class="{cls}"{anchor} aria-labelledby="{gid}">\n          {cards}\n        </ul>')
    return ('<section class="step start" id="start" tabindex="-1" aria-label="Choose your starting point">\n        '
            + '\n        '.join(parts) + '\n      </section>')


def back_link(a: dict) -> str:
    """The one way back from an answer, at the top, named after where it goes.

    `back: history` returns to the previous page through site.js and falls back to the cards."""
    back = a.get('back')
    if back == 'history':
        href, label, extra = './', 'Back', ' data-back="history"'
    elif back:
        href, label, extra = f'#{back["to"]}', back['label'], ''
    else:
        href, label, extra = './', 'All starting points', ''
    return f'<p class="go-back"><a href="{href}"{extra}><span aria-hidden="true">←</span>{esc(label)}</a></p>'


def line(s: dict, note: str | None, by_id: dict) -> str:
    url = r.SITE_HOME[s['id']][0] if s['id'] in r.SITE_HOME else s['url']
    name = f'<a href="{html.escape(url)}">{esc(s["name"])}</a>'
    if note is not None:
        note = link_services(note, by_id)
        return f'<li>{name}{note}</li>' if note.startswith(("'s", ' ')) else f'<li>{name}: {note}</li>'
    lead = r.first_sentence(s['description'])[0]
    tag = f' <span class="tag">{esc(s["status"][0].upper() + s["status"][1:])}</span>' if s['status'] else ''
    return f'<li>{name}: {esc(lead)}{tag}</li>'


WATCH = '! '


def item(text: str, by_id: dict, cls: str = '') -> str:
    """One list line. A line that starts with "! " is a watch-out: an outlined "!" mark, read out as "Watch out:"."""
    if text.startswith(WATCH):
        return f'<li class="w"><span class="vh">Watch out: </span>{link_services(text[len(WATCH):], by_id)}</li>'
    attr = f' class="{cls}"' if cls else ''
    return f'<li{attr}>{link_services(text, by_id)}</li>'


def item_list(lines: list[str], tag: str = 'ul', mix: bool = False) -> str:
    """Lists that mix tips and watch-outs, and all lists in a step-by-step answer, use the dot and "!" marks."""
    if not lines:
        return ''
    cls = 'picks mix' if mix or any('class="w"' in li for li in lines) else 'picks'
    body = '\n            '.join(lines)
    return f'<{tag} class="{cls}">\n            {body}\n          </{tag}>'


def block_items(b: dict, picked: list[dict], by_id: dict) -> list[str]:
    notes = b.get('notes', {})
    out = [item(t, by_id, 'plain') for t in b.get('before', [])]
    out += [line(s, notes.get(s['id']), by_id) for s in picked]
    out += [item(t, by_id, 'aside') for t in b.get('after', [])]
    return out


PLATFORM_NAMES = {'ios': 'iPhone', 'android': 'Android'}


def split_html(a: dict, b: dict, picked: list[dict], by_id: dict, mix: bool) -> str:
    """One list per phone platform. Without script both show, each under its name; site.js turns the names into
    a two-button switch that starts on the visitor's own platform. Apps for both platforms are in both lists."""
    plats = b['split']
    group = f'{a["id"]}-platform'
    buttons = ''.join(f'<button type="button" data-platform="{p}" aria-pressed="false">{PLATFORM_NAMES[p]}</button>' for p in plats)
    lists = []
    for p in plats:
        mine = [s for s in picked if p in s['platforms']]
        lis = block_items({**b, 'before': [], 'after': []}, mine, by_id)
        lists.append(f'<div class="plat" data-platform="{p}">\n          <h4 id="{a["id"]}-{p}">{PLATFORM_NAMES[p]}</h4>\n          '
                     f'{item_list(lis, mix=mix)}\n          </div>')
    seg = f'<div class="seg" role="group" aria-label="Phone" hidden>{buttons}</div>'
    return f'<div class="plats" id="{group}">\n          {seg}\n          ' + '\n          '.join(lists) + '\n          </div>'


def choose_html(b: dict, by_id: dict) -> str:
    """Option cards side by side (stacked on phones), each with its cost and fit, watch-outs, and a jump link."""
    cards = []
    for c in b['choose']:
        go = c.get('go')
        go = f'\n            <p class="go"><a href="{go["href"]}">{esc(go["label"])}<span aria-hidden="true"> ↓</span></a></p>' if go else ''
        cards.append(f'<li class="opt">\n            <h4>{esc(c["title"])}</h4>\n            <p>{link_services(c["text"], by_id)}</p>\n            '
                     f'{item_list([item(t, by_id) for t in c.get("items", [])], mix=True)}{go}\n          </li>')
    return '<ul class="choose">\n          ' + '\n          '.join(cards) + '\n        </ul>'


def block_body(a: dict, b: dict, services: list[dict], by_id: dict, mix: bool) -> str:
    picked = selected(b, services)
    parts = []
    if b.get('pre'):
        parts.append(f'<p class="pre">{link_services(b["pre"], by_id)}</p>')
    if b.get('choose'):
        parts.append(choose_html(b, by_id))
    if b.get('split'):
        before = [item(t, by_id, 'plain') for t in b.get('before', [])]
        if before:
            parts.append(item_list(before, mix=mix))
        parts.append(split_html(a, b, picked, by_id, mix))
        after = [item(t, by_id, 'aside') for t in b.get('after', [])]
        if after:
            parts.append(item_list(after, mix=mix))
    else:
        parts.append(item_list(block_items(b, picked, by_id), 'ol' if b.get('ordered') else 'ul', mix))
    return '\n          '.join(p for p in parts if p)


def count_html(b: dict, services: list[dict]) -> str:
    small = b.get('small', '')
    if 'count' in b:
        n = len(selected(b, services))
        one, many = b['count']
        small = f'{n} {one if n == 1 else many}'
    return f'<small>{esc(small)}</small>' if small else ''


def block_html(a: dict, b: dict, first: bool, services: list[dict], by_id: dict) -> str:
    """A collapsible block. The first one is open, and so is any block with `open: true`."""
    is_open = first or b.get('open')
    return (f'<details class="block"{" open" if is_open else ""}><summary><h3>{esc(b["title"])}</h3>{count_html(b, services)}</summary>\n'
            f'          {block_body(a, b, services, by_id, False)}\n        </details>')


def steps_html(a: dict, services: list[dict], by_id: dict) -> str:
    """`layout: steps`: numbered steps, each number once, with `sub: true` blocks as sub-sections of the step before."""
    out, n = [], 0
    if a.get('legend'):
        out.append('<p class="legend" aria-hidden="true"><span class="mk-dot"></span>= what to do <span class="mk-w">!</span>= watch out</p>')
    for b in a['blocks']:
        anchor = f' id="{b["anchor"]}"' if b.get('anchor') else ''
        if b.get('sub'):
            head = f'<h4 class="sub"{anchor}>{esc(b["title"])}</h4>'
        else:
            n += 1
            head = f'<h3 class="num"{anchor}><span class="n" aria-hidden="true">{n}</span><span class="vh">Step {n}: </span>{esc(b["title"])}</h3>'
        out.append(f'<div class="stepblock{" sub" if b.get("sub") else ""}">\n          {head}\n          {block_body(a, b, services, by_id, True)}\n        </div>')
    return '\n        '.join(out)


SIMS = '<p class="sims-ref"><strong>Picking SIMs?</strong> See <a href="data-plans.html">Data plans and SIMs</a>: upload speed, how much data you need, and the limits behind "unlimited".</p>'


def side_html(a: dict) -> str:
    out = []
    for item in a.get('side', []):
        (k, v), = item.items()
        out.append(SIMS if k == 'sims' else f'<p class="{k}">{v}</p>')
    out.append(f'<p class="send">Link to send: <a href="#{a["id"]}">howtoirl.org/<wbr>#{a["id"]}</a></p>')
    return '\n            '.join(out)


def answer_html(a: dict, services: list[dict], by_id: dict) -> str:
    aid = a['id']
    head = (f'<div class="result-head">\n          <svg class="ill big" aria-hidden="true"><use href="#{a["icon"]}"/></svg>\n          <div>\n'
            f'            <h2 id="{aid}-h">{esc(a["title"])}</h2>\n            <p class="sum">{a["summary"]}</p>\n          </div>\n        </div>')
    if a.get('question'):
        choices = '\n            '.join(card(c) for c in a['choices'])
        body = (f'<p class="hint">{a["hint"]}</p>\n        {a["extra"].strip()}\n'
                f'        <div class="ask-q">\n          <h3 class="q" id="{aid}-q">{esc(a["ask"])}</h3>\n'
                f'          <ul class="choices two" aria-labelledby="{aid}-q">\n            {choices}\n          </ul>\n        </div>')
        kind = 'question'
    else:
        if a.get('layout') == 'steps':
            blocks = steps_html(a, services, by_id)
        else:
            blocks = '\n        '.join(block_html(a, b, i == 0, services, by_id) for i, b in enumerate(a['blocks']))
        body = (f'<div class="result-body">\n          <div class="result-main">\n        {blocks}\n          </div>\n'
                f'          <div class="result-side">\n            {side_html(a)}\n          </div>\n        </div>')
        kind = 'result steps' if a.get('layout') == 'steps' else 'result'
    return (f'<section class="step {kind}" id="{aid}" tabindex="-1" aria-labelledby="{aid}-h">\n        {back_link(a)}\n'
            f'        {head}\n        {body}\n      </section>')


def fill(body: str, setup: dict, services: list[dict]) -> str:
    by_id = {s['id']: s for s in services}
    if '<!--setup:start-->' in body:
        body = body.replace('<!--setup:start-->', home_html(setup))
    if '<!--setup:answers-->' in body:
        body = body.replace('<!--setup:answers-->', '\n\n      '.join(answer_html(a, services, by_id) for a in setup['answers']))
    return body


def check(pkg: pathlib.Path, path: pathlib.Path = ROOT / 'content/setup.yaml') -> tuple[dict, list[str]]:
    services = json.loads((pkg / 'data/services.json').read_text())['services']
    schema = json.loads((pkg / 'schema/json/services.schema.json').read_text())
    setup = load_yaml(path)
    return setup, problems(setup, services, allowed_values(schema, services))


if __name__ == '__main__':
    pkg = ROOT / 'node_modules/@irl-commons/data'
    _, found = check(pkg, pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'content/setup.yaml')
    print('\n'.join(found) or 'setup.yaml: ok')
    sys.exit(1 if found else 0)
