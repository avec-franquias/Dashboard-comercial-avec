import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const id=(process.env.CLIENTE_ID||'').trim();
const nome=(process.env.CLIENTE_NOME||'').trim();
const documento=(process.env.CLIENTE_DOCUMENTO||'').replace(/\D/g,'');
if(!id||!nome) throw new Error('Cliente ID e nome sao obrigatorios');

const outPath=path.resolve('clientes-enrichment/latest.json');
await fs.mkdir(path.dirname(outPath),{recursive:true});
let db={updated_at:null,clientes:{}};try{db=JSON.parse(await fs.readFile(outPath,'utf8'))}catch{}

const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let result={cliente_id:id,nome,documento,status:'nao_encontrado',telefone:'',fonte:'Google Maps',maps_url:'',website:'',encontrado_em:new Date().toISOString()};
try{
 const ctx=await browser.newContext({locale:'pt-BR',viewport:{width:1440,height:1000}});
 const page=await ctx.newPage(); page.setDefaultTimeout(15000);
 const query=[nome,documento].filter(Boolean).join(' ');
 await page.goto('https://www.google.com/maps/search/'+encodeURIComponent(query),{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(2500);
 for(const label of ['Aceitar tudo','Accept all']){const b=page.getByRole('button',{name:label});if(await b.count())try{await b.first().click({timeout:2000})}catch{}}
 let url=page.url();
 const first=page.locator('a[href*="/maps/place/"]').first();
 if(await first.count()){url=await first.getAttribute('href');if(url)await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(1000)}
 const data=await page.evaluate(()=>{
   const btn=prefix=>[...document.querySelectorAll('button')].find(x=>(x.getAttribute('data-item-id')||'').startsWith(prefix));
   const phone=btn('phone:tel:')?.getAttribute('data-item-id')?.replace('phone:tel:','')||'';
   const website=document.querySelector('a[data-item-id="authority"]')?.href||'';
   const name=document.querySelector('h1')?.textContent?.trim()||'';
   return {phone,website,name};
 });
 result={...result,status:data.phone?'encontrado':'sem_telefone',telefone:data.phone,website:data.website,maps_url:page.url(),nome_encontrado:data.name};
 await ctx.close();
}finally{await browser.close()}
db.clientes=db.clientes||{};db.clientes[id]=result;db.updated_at=new Date().toISOString();
await fs.writeFile(outPath,JSON.stringify(db,null,2));
console.log(result);
