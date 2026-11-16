import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {HtmlValidate} from 'html-validate';
const root=path.resolve('dist');
const config=JSON.parse(await readFile('site.json','utf8'));
const docs=new Map(await Promise.all(config.pages.map(async name=>[name,await readFile(path.join(root,name),'utf8')])));
const ids=text=>new Set([...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
const decode=s=>s.replaceAll('&amp;','&');
test('Every page has its canonical URL, metadata, one h1 and unique ids',()=>{
 for(const [name,text] of docs){
  assert.equal((text.match(/<h1\b/g)||[]).length,1,name);
  const all=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(all).size,all.length,name);
  const url=`https://${config.domain}/${name==='index.html'?'':name}`;
  assert.ok(text.includes(`rel="canonical" href="${url}"`),name);
  assert.ok(text.includes(`property="og:url" content="${url}"`),name);
  assert.ok(!text.includes('name="robots"'),name);
  assert.ok(!text.includes('OpenStreamBox Initiative'),name);
  assert.ok(!text.includes('>Data and standards</a>'),name);
 }
});
test('Local links and fragments resolve',async()=>{
 for(const [name,text] of docs)for(const match of text.matchAll(/(?:href|src)="([^\"]+)"/g)){
  const value=decode(match[1]);if(/^(https?:|mailto:|tel:)/.test(value))continue;
  const [file,hash]=value.split('#');const target=file?file.replace(/^\//,''):name;
  assert.ok(!target.includes('..'),value);
  await stat(path.join(root,target));
  if(hash&&docs.has(target))assert.ok(ids(docs.get(target)).has(hash),`${name}: ${value}`);
 }
});
test('Strict CSP: one first-party script, no inline executable code or third-party resources',async()=>{
 const scripts=new Set();
 for(const [name,text] of docs){
  assert.ok(!/<style\b|\sstyle=|\son\w+=/i.test(text),name);
  for(const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
   assert.equal(m[2].trim(),'');const src=/src="([^"]+)"/.exec(m[1]);assert.ok(src);assert.ok(src[1].startsWith('/assets/'));scripts.add(src[1]);
  }
  assert.ok(!/<(?:img|script|iframe|video|audio)[^>]+src="(?:https?:|\/\/)|<link[^>]+href="(?:https?:|\/\/)(?![^>]*rel="canonical")/i.test(text.replace(/<link rel="(?:canonical|alternate)"[^>]*>/g,'')),name);
 }
 assert.equal(scripts.size,1);
 assert.ok((await readFile('public/_headers','utf8')).includes("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"));
});
test('Data entries offer text-field-only edit forms',()=>{
 for(const [name,text] of docs){
  if(['glossary.html','help.html','links.html','standards.html'].includes(name))assert.ok(text.includes('Suggest an edit'),name);
  for(const m of text.matchAll(/href="([^\"]*template=edit-entry.yml[^\"]*)"/g)){
   const url=new URL(decode(m[1]));for(const key of url.searchParams.keys())assert.ok(['template','title','entry','source','changes'].includes(key),key);
  }
 }
});
test('HTML validates',async()=>{
 const validator=new HtmlValidate({extends:['html-validate:recommended'],rules:{'aria-label-misuse':'off','void-style':'off','no-trailing-whitespace':'off','wcag/h32':'off','svg-focusable':'off','long-title':'off','prefer-native-element':'off','no-inline-style':'error','attr-quotes':'off'}});
 for(const [name,text] of docs){const result=await validator.validateString(text,name);assert.ok(result.valid,JSON.stringify(result.results.flatMap(r=>r.messages).slice(0,15)));}
});
test('Sitemap covers the complete page list and schemas retain canonical ids',async()=>{
 const map=await readFile('dist/sitemap.xml','utf8');assert.equal((map.match(/<loc>/g)||[]).length,config.pages.length);
 if(config.domain==='irlcommons.org')for(const repo of ['stream-status','stream-session']){const s=JSON.parse(await readFile(`dist/schemas/${repo}/v0.json`,'utf8'));assert.equal(s.$id,`https://irlcommons.org/schemas/${repo}/v0.json`);}
});

test('Search and naming rendering use explicit names, service evidence and see links', async()=>{
 const {execFileSync}=await import('node:child_process');
 execFileSync('python3',['-c', `
import sys
sys.path.insert(0, 'shared')
import render as r
w = {'id':'sample', 'term':'Sample', 'also_called':['Synonym'], 'search_terms':['Search only'], 'aliases':['Deprecated only'], 'plain':'A sample.', 'naming':{'label':'Sample label','plural':'Sample labels','case':'sentence','status':'draft','scope':'A setting.','why':'A reason.','translation_note':'A note.','alternatives':[{'term':'Other name','status':'ambiguous','why':'Another meaning.','see':'other'}],'evidence':[{'service':'sample-service','label':'Observed label','support':'context-only','note':'A context source.','url':'https://example.org/source','read_on':'2026-11-15'}]}}
names=r.word_names(w)
assert all(x in names for x in ['Synonym','Search only','Other name','Sample labels'])
assert 'Deprecated only' not in names
target={'id':'other','term':'Other name','plain':'Another meaning.'}
out=r.naming_entry(w,[w,target],[{'id':'sample-service','name':'Sample service'}])
assert 'Where seen' in out and 'Context only' in out and 'Observed label' in out
assert 'Sample service' in out and 'makers' not in out
assert 'Other name usually means Another meaning.' in out
assert 'glossary.html#other' in out
`],{stdio:'pipe'});
});

test('Glossary card links use the word target and accessible name', async()=>{
 const {execFileSync}=await import('node:child_process');
 execFileSync('python3',['-c', `
import sys
sys.path.insert(0, 'shared')
import render as r
body = '<dl><div class="entry" id="sample"><dt data-word="sample">Sample &amp; word</dt><dd>Meaning.</dd></div></dl>'
out = r.add_permalinks(body)
assert 'href="#sample" aria-label="Link to Sample &amp; word"' in out
assert not r.permalink_problems('sample.html', out)
assert r.add_permalinks(out) == out
`],{stdio:'pipe'});
});

test('Home: visible h1, no lede, steps bar, SIMs note or pager, the three groups with the agreed card texts', async()=>{
 const text=docs.get('index.html');
 assert.ok(/<h1 class="home-title">How to IRL<\/h1>/.test(text));
 assert.ok(!text.includes('sims-note')&&!text.includes('How to pick data plans and SIMs')&&!text.includes('class="pager'));
 assert.ok(/<ul class="choices learn" id="sims"/.test(text),'#sims still lands on the Learn section');
 assert.ok(!text.includes('class="lede"')&&!text.includes('Where does your stream stand today?')&&!text.includes("It doesn't break"));
 const start=text.slice(text.indexOf('id="start"'),text.indexOf('</section>',text.indexOf('id="start"')));
 assert.ok(!start.includes('class="steps"'));
 const cards=[...start.matchAll(/<strong>([^<]+)<\/strong><span>([^<]+)<\/span>/g)].map(m=>`${m[1]} — ${m[2]}`.replaceAll('&#39;',"'").replaceAll('&quot;','"'));
 assert.deepEqual(cards,[
  'Not started yet — Help me get started streaming IRL','Desk and away — Switch between desktop and IRL: hybrid streaming',
  'A better picture — A standalone camera, like a DSLR','Several cameras — Mix phones and cameras in one scene',
  'The signal drops — In crowds, on trains or in weak spots','The phone gives up — It gets too hot, or the battery runs out',
  'My home setup fails — My PC, power or internet at home','No signal at all — I stream outdoors, far from cell towers',
  'Glossary — Look up IRL terms and what they mean','Help — Find guides and help for the apps and services you use',
  'Data plans and SIMs — Upload speed, how much data you need, and the limits behind "unlimited"',
  'Why more than one network? — One network has short bad moments, even a fast one. A second network covers them.']);
 assert.deepEqual([...start.matchAll(/<h2 class="grp"[^>]*>([^<]+)</g)].map(m=>m[1]),['Start or add something','Fix what breaks','Learn more and get help']);
});

test('Answer blocks are collapsible, with the first one open; step-by-step answers have no folds', ()=>{
 const text=docs.get('index.html');
 const open={'one-phone':[true,true,true],'better-picture':[true,false,false,false],'build':[true,true],'receiver':[true,true]};
 for(const m of text.matchAll(/<section class="step result" id="([^"]+)"[\s\S]*?<\/section>/g)){
  const blocks=[...m[0].matchAll(/<details class="block"( open)?>/g)];
  assert.ok(blocks.length>0,m[1]);
  assert.deepEqual(blocks.map(b=>!!b[1]),open[m[1]]||blocks.map((_,i)=>i===0),m[1]);
 }
 const hybrid=answerHtml(text,'hybrid');
 assert.ok(hybrid.startsWith('<section class="step result steps" id="hybrid"')&&!hybrid.includes('<details'));
});

const answerHtml=(text,id)=>text.match(new RegExp(`<section class="step [a-z ]+" id="${id}"[\\s\\S]*?<\\/section>`))[0];
const plain=(html)=>html.replace(/<span class="vh">Watch out: <\/span>/g,'! ').replace(/<a class="permalink"[^>]*>#<\/a>/g,'').replace(/<[^>]+>/g,'').replaceAll('&nbsp;',' ').replaceAll('&#39;',"'").replaceAll('&quot;','"').replaceAll('&amp;','&').replace(/\s+/g,' ').trim();

test('Desktop and IRL: one opening, five numbered steps, the home/cloud chooser and the scene-control list', ()=>{
 const h=answerHtml(docs.get('index.html'),'hybrid');
 assert.ok(h.includes('<h2 id="hybrid-h">Desktop and IRL in one stream'));
 assert.ok(plain(h).includes('To switch between desktop and IRL without ending your stream, send both to a hub: a server or an OBS instance that lets you switch between different sources. Only the hub goes live on Twitch, YouTube or Kick.'));
 const steps=[...h.matchAll(/<h3 class="num"[^>]*><span class="n" aria-hidden="true">(\d)<\/span><span class="vh">Step \d: <\/span>([^<]+)</g)].map(m=>`${m[1]} ${m[2]}`);
 assert.deepEqual(steps,['1 Pick where the hub runs','2 Make three scenes in the hub','3 Send to the hub from where you are','4 Switch scenes while you are away','5 During the stream']);
 assert.deepEqual([...h.matchAll(/<li class="opt">\s*<h4>([^<]+)/g)].map(m=>m[1]),['On your PC at home','In the cloud']);
 assert.ok(h.includes('href="#hybrid-home"')&&h.includes('id="hybrid-home"')&&h.includes('href="#hybrid-cloud"')&&h.includes('id="hybrid-cloud"'));
 const remote=h.slice(h.indexOf('Switch scenes while you are away'),h.indexOf('During the stream'));
 assert.deepEqual([...remote.matchAll(/<li><a href="[^"]+">([^<]+)<\/a>/g)].map(m=>m[1]),['IRL+ Chat','IRLwhatever','Moblin','NOALBS','NOALBS Cloud','OBS Blade','Streamer.bot']);
 assert.ok(!h.includes('SimpleStreamer')&&!h.includes('NoDrop')&&!/two starts/i.test(h));
 for(const w of ['hub','scene','brb','relay','cloud-obs','drop-protection']) assert.ok(h.includes(`class="gl" href="glossary.html#${w}"`),w);
});

test('Watch-out marks: a visually hidden "Watch out:" on every marked line, in all three answers', ()=>{
 const text=docs.get('index.html');
 const want={'hybrid':9,'one-phone':4,'better-picture':5,'second-network':3,'build':1,'several-cameras':2,'cloud':2,'receiver':2,'into-obs':3,'satellite':3};
 for(const [id,n] of Object.entries(want)){
  const h=answerHtml(text,id);
  const marks=[...h.matchAll(/<li class="w">(.*?)<\/li>/g)];
  assert.equal(marks.length,n,id);
  for(const m of marks) assert.ok(m[1].startsWith('<span class="vh">Watch out: </span>'),id);
  assert.ok(/<ul class="picks mix[^"]*">/.test(h),id);
 }
 const all=plain(text);
 for(const line of ['! Keep the stream key secret. Anyone who has it can go live on your channel.',
  '! On YouTube, switch on live streaming a day early. The first time can take up to 24 hours.',
  "! Many mic receivers plug into the phone's charging port. Check that yours lets you charge at the same time.",
  'A power bank, in case your phone runs empty. ! Unplug it when the phone gets hot: charging adds heat.',
  '! Coming back: switch to the desktop scene first, then stop the phone app. The other way round, viewers see a frozen picture or BRB.',
  "! Check that your app or backpack uses the camera's sound. Not all do."])
  assert.ok(all.includes(line),line);
 assert.ok(!all.includes('Every backpack and encoder'));
 for(const [f,t] of docs) assert.ok(!t.includes('class="legend"')&&!/= what to do|= watch out/.test(t),f);
 assert.ok(/\.picks\.mix li\.w::before[^{]*\{[^}]*var\(--caution\)/.test(readFileSync('public/assets/style.css','utf8')));
});

test('One phone: first stream steps, an iPhone/Android switch that works without script, and the data line', ()=>{
 const h=answerHtml(docs.get('index.html'),'one-phone');
 assert.ok(/<div class="seg" role="group" aria-label="Phone" hidden><button type="button" data-platform="ios" aria-pressed="false">iPhone<\/button><button type="button" data-platform="android" aria-pressed="false">Android<\/button><\/div>/.test(h));
 const list=(p)=>[...h.slice(h.indexOf(`<div class="plat" data-platform="${p}">`)).split('</div>')[0].matchAll(/<li><a href="[^"]+">([^<]+)/g)].map(m=>m[1]);
 for(const both of ['Larix Broadcaster','TVU Go']) assert.ok(list('ios').includes(both)&&list('android').includes(both),both);
 assert.ok(list('ios').includes('Moblin')&&!list('android').includes('Moblin'));
 assert.ok(!/<div class="plat"[^>]* hidden/.test(h),'both lists show without script');
 assert.ok(plain(h).includes('Check your data plan. An hour at 6 Mbit/s uses about 2.7 GB: Data plans and SIMs.'));
 assert.ok(!h.includes("platforms' own apps")&&!h.includes('carry nothing extra'));
});

test('A standalone camera: the camera checklist, the Moblin note and the side line to several cameras', ()=>{
 const t=plain(answerHtml(docs.get('index.html'),'better-picture'));
 for(const line of ['! A capture adapter draws from the phone, so the phone empties faster.',
  'Hands. Filming, talking and reading chat at once is hard. An action camera, or a phone, on a chest mount keeps your hands free.',
  "On iPhone, a camera that streams over Wi-Fi can send to Moblin's local ingest.",
  'A camera with a USB webcam mode plugs in without one.','Next: to show the camera and your phone together, see several cameras.'])
  assert.ok(t.includes(line),line);
 assert.ok(!/into the hub|through the receiver/i.test(t));
});

test('The platform switch starts on the visitor\'s own phone', async()=>{
 const vm=await import('node:vm');
 // site.js holds two script parts, and each hands its helpers to module.exports.
 const site={};
 vm.runInNewContext(readFileSync('public/assets/site.js','utf8'),{module:{get exports(){return site;},set exports(v){Object.assign(site,v);}}});
 assert.equal(site.pickPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)',['ios','android']),'android');
 assert.equal(site.pickPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',['ios','android']),'ios');
 assert.equal(site.pickPlatform('Mozilla/5.0 (Windows NT 10.0)',['ios','android']),'ios');
});

test('setup.yaml checks catch unknown values, untagged homes and stale notes', async()=>{
 const {execFileSync}=await import('node:child_process');
 execFileSync('python3',['-c', `
import sys, json, pathlib, copy
sys.path.insert(0, 'scripts')
import setup as st
pkg = pathlib.Path('node_modules/@irl-commons/data')
base, found = st.check(pkg)
assert found == [], found
services = json.loads((pkg / 'data/services.json').read_text())['services']
allowed = st.allowed_values(json.loads((pkg / 'schema/json/services.schema.json').read_text()), services)
def run(change):
    s, sv = copy.deepcopy(base), copy.deepcopy(services)
    change(s, sv)
    return ' | '.join(st.problems(s, sv, allowed))
def block(s, aid, title):
    return next(b for a in s['answers'] if a['id'] == aid for b in a['blocks'] if b['title'] == title)
assert 'tags "dslr" is not in IRL Commons' in run(lambda s, sv: block(s, 'better-picture', 'Into your phone')['select'][0].update(tags='dslr'))
assert 'class "phones" is not in IRL Commons' in run(lambda s, sv: block(s, 'one-phone', 'Streaming apps')['select'][0].update({'class': 'phones'}))
assert 'unknown field "colour"' in run(lambda s, sv: block(s, 'one-phone', 'Streaming apps')['select'][0].update(colour='red'))
assert 'is tagged camera-in, but no block' in run(lambda s, sv: next(x for x in sv if x['id'] == 'speedify')['tags'].append('camera-in'))
assert 'note for "irlplus-cast", which this block no longer selects' in run(lambda s, sv: next(x for x in sv if x['id'] == 'irlplus-cast')['tags'].remove('camera-in'))
assert 'no such service' in run(lambda s, sv: block(s, 'better-picture', 'In a backpack').update(pre='{no-such-app}'))
answer = lambda s, aid: next(a for a in s['answers'] if a['id'] == aid)
assert 'back link to #nowhere, which is no answer' in run(lambda s, sv: answer(s, 'build').update(back={'to': 'nowhere', 'label': 'Nowhere'}))
assert 'back is "#more"' in run(lambda s, sv: answer(s, 'build').update(back='#more'))
assert 'jumps to #nowhere' in run(lambda s, sv: block(s, 'hybrid', 'Pick where the hub runs')['choose'][0]['go'].update(href='#nowhere'))
assert 'split by "windows"' in run(lambda s, sv: block(s, 'one-phone', 'Streaming apps').update(split=['ios', 'windows']))
assert 'starts with a watch-out' in run(lambda s, sv: block(s, 'one-phone', 'Your first stream')['before'].insert(0, '! Careful.'))
assert 'an ordered block lists steps only' in run(lambda s, sv: block(s, 'one-phone', 'Your first stream').update(select=[{'id': 'moblin'}]))
assert 'a lead line without services' in run(lambda s, sv: block(s, 'build', 'What you need').update(lead='These:'))
assert 'is tagged scene-control, but no block' in run(lambda s, sv: block(s, 'hybrid', 'Switch scenes while you are away').update(select=[{'id': 'moblin'}], notes={}))
`],{stdio:'pipe'});
});

test('Answers: exactly one back link at the top that names where it goes, no steps or bottom nav', ()=>{
 const text=docs.get('index.html');
 assert.ok(!/class="(?:steps|step-bar|step-nav|back-to)"/.test(text)&&!text.includes('Back to:'));
 const want={'more':['./','All starting points'],'build':['#more','Build or buy'],'ready-made':['#more','Build or buy'],
  'receiver':['./','Back'],'into-obs':['./','Back']};
 const found=[...text.matchAll(/<section class="step (?:result|question)(?: steps)?" id="([^"]+)"[\s\S]*?<\/section>/g)];
 assert.ok(found.length>=10);
 for(const m of found){
  const links=[...m[0].matchAll(/<p class="go-back"><a href="([^"]+)"( data-back="history")?><span aria-hidden="true">←<\/span>([^<]+)<\/a><\/p>/g)];
  assert.equal(links.length,1,m[1]);
  assert.ok(m[0].indexOf('class="go-back"')<m[0].indexOf('class="result-head"'),m[1]);
  const [href,label]=want[m[1]]||['./','All starting points'];
  assert.deepEqual([links[0][1],links[0][3]],[href,label],m[1]);
  assert.equal(!!links[0][2],label==='Back',m[1]);
  assert.ok(m[0].includes('Link to send')||m[1]==='more',m[1]);
 }
});


test('Numbered steps keep their numbers; watch-outs sit under a step without one', ()=>{
 const h=answerHtml(docs.get('index.html'),'one-phone');
 const ol=h.match(/<ol class="picks steps">([\s\S]*?)<\/ol>/)[1];
 const steps=ol.split(/\n            <li>/).slice(1);
 assert.equal(steps.length,2);
 assert.ok(steps[0].startsWith('Install a streaming app')&&steps[1].startsWith('Test at home with Wi-Fi off'));
 const nested=steps[0].match(/<ul class="picks mix">([\s\S]*?)<\/ul>/)[1];
 assert.deepEqual([...nested.matchAll(/<li class="w"><span class="vh">Watch out: <\/span>([^.]+)/g)].map(m=>m[1]),['Keep the stream key secret','On YouTube, switch on live streaming a day early']);
 assert.ok(!/<ol class="picks mix/.test(docs.get('index.html')),'an ordered list never drops its numbers');
 const css=readFileSync('public/assets/style.css','utf8');
 assert.ok(/ol\.picks\.steps[^{]*\{[^}]*list-style: decimal/.test(css));
});

test('Round 4: titles, summaries, steps, lead lines and side lines of the nine answers', ()=>{
 const text=docs.get('index.html');
 const want={
  'second-network':['Add a second network',"Add a second internet connection on a different mobile network, and let your streaming app use both at once. That's called bonding. If one network has a bad moment, the other can carry the stream."],
  'more':['Keep the phone going','When heat or an empty battery ends your stream, try these first.'],
  'build':['Build your own backpack','You put the backpack together from parts and run one of these systems on it. You choose every part, and you set it up and fix it yourself.'],
  'ready-made':['A ready-made backpack, with support','Ready to use when it arrives. Some fit in a backpack, others mount on the camera. Rentals and warranties depend on the package.'],
  'several-cameras':['Several cameras in one scene','Something has to put the pictures together: an app on the phone, OBS on a PC or server, a hub in the cloud, or a box in your backpack.'],
  'cloud':['Move the hub to the cloud','With the hub on a rented server, your away stream keeps running even if the PC, power or internet at home fails. The hub is OBS on that server, or a hosted service.'],
  'receiver':['A receiver for your bonded stream',"Bonding splits your stream over several connections. A receiver is the server that joins it back together before OBS or the platform. Some apps and cloud hubs include one. If yours doesn't, pick one here."],
  'into-obs':['Into OBS','Your app or backpack sends the stream to a receiver. OBS takes it from there. Start Streaming in OBS is what goes live.'],
  'satellite':['Add a satellite dish',"Satellite internet works far from cell towers. Use it on its own where there's no mobile signal, or as one more connection where mobile networks are busy."]};
 for(const [id,[title,sum]] of Object.entries(want)){
  const h=answerHtml(text,id);
  assert.equal(plain(h.match(new RegExp(`<h2 id="${id}-h">[\\s\\S]*?<\\/h2>`))[0]),title,id);
  assert.equal(plain(h.match(/<p class="sum">[\s\S]*?<\/p>/)[0]),sum,id);
 }
 const sn=answerHtml(text,'second-network');
 assert.deepEqual([...sn.matchAll(/<span class="vh">Step \d: <\/span>([^<]+)/g)].map(m=>m[1]),['Get a second connection','Bond them','Test it']);
 const helper=sn.slice(sn.indexOf('Or a helper that bonds for your app or adds spare phones:'));
 assert.ok(/^Or a helper[^<]*\n\s*<ul class="picks mix">\s*<li><a /.test(helper),'catalogue list nested under the helper line');
 assert.ok(!sn.includes('class="sims-ref"'));
 const sc=plain(answerHtml(text,'several-cameras'));
 for(const l of ['When your phone app can show those cameras.','When you mix on a computer, at home or on a server.','When the show has to keep running if your PC at home fails.',"When you mix while you're out.",'with SRTLA bonding and drop protection.','Desktop and IRL.']) assert.ok(sc.includes(l),l);
 const more=answerHtml(text,'more');
 assert.equal(plain(more.match(/<h3 class="q" id="more-q">[\s\S]*?<\/h3>/)[0]),'Still too hot or too short?');
 assert.ok(plain(more).includes('Still too hot or too short? A backpack carries a small streaming computer, mobile modems and a battery, so the phone no longer does that work. Do you want to build and look after one yourself?'));
 assert.ok(plain(more).includes('Extra cooling Tips from other streamers:')&&!more.includes("I haven't tested")&&!more.includes('Work in progress'));
 assert.equal((more.match(/class="tip-src"/g)||[]).length,5);
 const obs=plain(answerHtml(text,'into-obs'));
 assert.ok(obs.includes('OBS IRL Source or Smooth Media Source (Windows), reconnects on its own.')&&obs.includes('two fight over the scenes')&&!obs.includes('Choose something else'));
});

test('Site copy says receiver; relay is only another name in the glossary and part of product names', ()=>{
 const ok=[/IRLrelays/g,/Moblink relays/g,/self-hosted relay workflows/g,/relay ID/g,/BELABOX Cloud Relay/g];
 for(const [f,t] of docs){
  let txt=plain(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<(?:[^>"]|"[^"]*")*>/g,' '));
  for(const r of ok) txt=txt.replace(r,'');
  if(f==='glossary.html') txt=txt.replace('Also called: Relay server, Bonding server','');
  assert.ok(!/relay/i.test(txt),`${f}: ${(txt.match(/.{0,60}relay.{0,30}/i)||[''])[0]}`);
 }
});
