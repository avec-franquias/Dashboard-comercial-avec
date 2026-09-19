import fs from 'node:fs/promises';

let CACHE=null;
const chave=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
async function base(){
  if(CACHE) return CACHE;
  CACHE=JSON.parse(await fs.readFile(new URL('../geo/bairros-br.json',import.meta.url),'utf8'));
  return CACHE;
}
export default async function handler(req,res){
  try{
    const uf=String(req.query?.uf||'').trim().toUpperCase();
    const cidade=chave(req.query?.cidade||'');
    if(!uf||!cidade) return res.status(400).json({ok:false,bairros:[]});
    const b=await base();
    const bairros=b?.[uf]?.[cidade]||[];
    res.setHeader('Cache-Control','public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).json({ok:true,uf,cidade,bairros});
  }catch(e){return res.status(500).json({ok:false,bairros:[],error:e.message||String(e)})}
}
