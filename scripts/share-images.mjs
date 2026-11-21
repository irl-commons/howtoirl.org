// The share images chat apps show for a link to an answer page (og:image): the answer's drawing, its title and
// the first sentence of its summary on paper, with the wordmark. Run after `npm run build`:
//   npm run share-images
// It writes public/assets/share/<answer>.png for every built page whose og:image points there, from the
// built page itself, so the picture uses the site's own stylesheet, fonts and drawing. Commit the images.
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {serve} from './serve.mjs';

const config=JSON.parse(await readFile('site.json','utf8'));
const wanted=[];
for(const name of config.pages){
 const html=await readFile(`dist/${name}`,'utf8');
 const m=/<meta property="og:image" content="https:\/\/[^/]+\/(assets\/share\/[a-z0-9-]+\.png)">/.exec(html);
 if(m)wanted.push([name,m[1]]);
}
await mkdir('public/assets/share',{recursive:true});
const server=await serve('dist');
const browser=await chromium.launch();
try{
 // bypassCSP: the card is laid out with a few inline styles; the page itself keeps its strict CSP.
 const context=await browser.newContext({viewport:{width:1200,height:630},colorScheme:'light',reducedMotion:'reduce',bypassCSP:true});
 const page=await context.newPage();
 for(const [name,out] of wanted){
  await page.goto(`${server.origin}/${name}`,{waitUntil:'load'});
  await page.evaluate(()=>document.fonts.ready.then(()=>true));
  await page.evaluate(name=>{
   const head=document.querySelector('.result-head');
   const icon=head.querySelector('use').getAttribute('href');
   const title=head.querySelector('h1').textContent.trim();
   const line=head.querySelector('.sum').textContent.trim().split(/(?<=[.!?])\s/)[0];
   const card=document.createElement('div');
   card.innerHTML=`<div class="sc-art"><svg class="ill" aria-hidden="true"><use href="${icon}"/></svg></div>
    <div class="sc-text"><p class="sc-title"></p><p class="sc-line"></p></div>
    <p class="sc-brand"><svg aria-hidden="true"><use href="#mark"/></svg>How to IRL</p>
    <p class="sc-url">howtoirl.org/${name}</p>`;
   card.querySelector('.sc-title').textContent=title;
   card.querySelector('.sc-line').textContent=line;
   const s=document.createElement('style');
   s.textContent=`body>*:not(.sc){display:none!important}
    .sc{position:fixed;inset:0;z-index:99;background:var(--bg);color:var(--fg);display:grid;grid-template-columns:420px 1fr;grid-template-rows:1fr auto;padding:64px 72px 48px;gap:0 56px;font-family:var(--sans)}
    .sc-art{display:flex;align-items:center;justify-content:center}
    .sc-art .ill{width:390px;height:260px;margin:0}
    .sc-text{align-self:center}
    .sc-title{font-size:64px;line-height:1.05;font-weight:700;letter-spacing:-0.02em;margin:0 0 24px;text-wrap:balance}
    .sc-line{font-size:30px;line-height:1.35;margin:0;color:var(--fg);text-wrap:pretty;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
    .sc-brand{display:flex;align-items:center;gap:12px;margin:0;font-size:30px;font-weight:700;align-self:end}
    .sc-brand svg{width:44px;height:44px}
    .sc-url{margin:0;align-self:end;justify-self:end;font-family:var(--mono);font-size:22px;color:var(--muted)}`;
   card.className='sc';
   document.head.appendChild(s);
   document.body.appendChild(card);
  },name);
  await page.screenshot({path:`public/${out}`,animations:'disabled',caret:'hide'});
  console.log(`public/${out}`);
 }
 await context.close();
}finally{await browser.close();await server.close();}
