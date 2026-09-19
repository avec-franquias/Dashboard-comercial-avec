import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd());
const configPath=path.join(ROOT,'config','leads-queries.json');
const outputPath=path.join(ROOT,'extrator-data','latest.json');
const historyDir=path.join(ROOT,'extrator-data','history');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function collectMaps(browser,{nicho,cidade,bairro,max_results=80}){
 const context=await browser.newContext({locale:'pt-BR',viewport:{width:1440,height:1000}});
 const page=await context.newPage(); page.setDefaultTimeout(15000);
 try{
  const q=[nicho,bairro,cidade].filter(Boolean).join(' ');
  await page.goto('https://www.google.com/maps/search/'+encodeURIComponent(q),{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(2500);
  for(const label of ['Aceitar tudo','Accept all']){const b=page.getByRole('button',{name:label});if(await b.count())try{await b.first().click({timeout:2500});await sleep(800)}catch{}}
  const feed=page.locator('div[role="feed"]');
  if(await feed.count()){let prev=0,stable=0;for(let i=0;i<40&&stable<5;i++){const n=await page.locator('a[href*="/maps/place/"]').count();stable=n===prev?stable+1:0;prev=n;await feed.evaluate(el=>el.scrollTo(0,el.scrollHeight));await sleep(850)}}
  const hrefs=await page.locator('a[href*="/maps/place/"]').evaluateAll(as=>[...new Set(as.map(a=>a.href).filter(Boolean))]);
  const urls=hrefs.slice(0,Math.max(1,Math.min(Number(max_results)||80,120))),out=[];
  for(const url of urls){
   const p=await context.newPage();p.setDefaultTimeout(9000);
   try{
    await p.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await sleep(650);
    const data=await p.evaluate(()=>{
      const text=s=>document.querySelector(s)?.textContent?.trim()||'';
      const btn=prefix=>[...document.querySelectorAll('button')].find(x=>(x.getAttribute('data-item-id')||'').startsWith(prefix));
      const phone=btn('phone:tel:')?.getAttribute('data-item-id')?.replace('phone:tel:','')||'';
      const website=document.querySelector('a[data-item-id="authority"]')?.href||'';
      const ab=btn('address');
      const address=(ab?.getAttribute('aria-label')||'').replace(/^Endereço:\s*/i,'').replace(/^Address:\s*/i,'');
      const category=document.querySelector('button[jsaction*="category"]')?.textContent?.trim()||'';
      const rating=document.querySelector('div.F7nice span[aria-hidden="true"]')?.textContent?.trim()||'';
      const reviews=(document.querySelector('div.F7nice span[aria-label*="avalia"]')?.getAttribute('aria-label')||'').match(/[\d.]+/)?.[0]||'';
      return {name:text('h1'),phone,website,address,category,rating,reviews};
    });
    const here=p.url(),place_id=(here.match(/!1s([^!]+)/)?.[1]||url);
    if(data.name)out.push({...data,place_id,maps_url:here});
   }catch(e){console.warn('Falha em local:',e.message)}finally{await p.close()}
  }
  const dedup=new Map();for(const x of out){const k=x.place_id||x.name+'|'+x.address;if(!dedup.has(k))dedup.set(k,x)}
  return [...dedup.values()];
 }finally{await context.close()}
}

const cfg=JSON.parse(await fs.readFile(configPath,'utf8'));
const manualNicho=(process.env.LEADS_NICHO||'').trim();
const manualCidade=(process.env.LEADS_CIDADE||'').trim();
const manualBairro=(process.env.LEADS_BAIRRO||'').trim();
const manualMax=Math.max(1,Math.min(Number(process.env.LEADS_MAX_RESULTS||80)||80,120));
const queries=(manualNicho&&manualCidade)
  ? [{enabled:true,nicho:manualNicho,cidade:manualCidade,bairro:manualBairro,max_results:manualMax}]
  : (cfg.queries||[]).filter(q=>q?.enabled!==false&&q?.nicho&&q?.cidade);
await fs.mkdir(path.dirname(outputPath),{recursive:true});await fs.mkdir(historyDir,{recursive:true});
let previous={runs:[]};try{previous=JSON.parse(await fs.readFile(outputPath,'utf8'))}catch{}
const prevMap=new Map((previous.runs||[]).map(r=>[[r.query?.nicho,r.query?.cidade,r.query?.bairro||''].join('|').toLowerCase(),r]));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const runs=[];
try{
 for(const q of queries){
  console.log('Coletando',q.nicho,q.cidade,q.bairro||'');
  const leads=await collectMaps(browser,q),key=[q.nicho,q.cidade,q.bairro||''].join('|').toLowerCase(),old=prevMap.get(key);
  const oldIds=new Set((old?.leads||[]).map(x=>x.place_id||x.name+'|'+x.address)),new_ids=[];
  for(const x of leads){const id=x.place_id||x.name+'|'+x.address;if(!oldIds.has(id))new_ids.push(id)}
  runs.push({query:{nicho:q.nicho,cidade:q.cidade,bairro:q.bairro||'',max_results:q.max_results||80},finished_at:new Date().toISOString(),total:leads.length,new_count:new_ids.length,new_ids,leads});
  await sleep(1000);
 }
}finally{await browser.close()}
let mergedRuns=runs;
if(manualNicho&&manualCidade){
  const currentKeys=new Set(runs.map(r=>[r.query?.nicho,r.query?.cidade,r.query?.bairro||''].join('|').toLowerCase()));
  mergedRuns=[...(previous.runs||[]).filter(r=>!currentKeys.has([r.query?.nicho,r.query?.cidade,r.query?.bairro||''].join('|').toLowerCase())),...runs];
}
const payload={generated_at:new Date().toISOString(),runs:mergedRuns};
await fs.writeFile(outputPath,JSON.stringify(payload,null,2));
const stamp=new Date().toISOString().replace(/[:.]/g,'-');await fs.writeFile(path.join(historyDir,stamp+'.json'),JSON.stringify(payload,null,2));
const files=(await fs.readdir(historyDir)).filter(x=>x.endsWith('.json')).sort().reverse();await Promise.all(files.slice(30).map(f=>fs.unlink(path.join(historyDir,f))));
console.log('Base atualizada:',runs.length,'região(ões).');
