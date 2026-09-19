import fs from 'node:fs/promises';

const chave=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');

export default async function handler(req,res){
  try{
    const uf=String(req.query?.uf||'').trim().toUpperCase();
    const cidade=chave(req.query?.cidade||'');
    if(!uf||!cidade) return res.status(400).json({ok:false,bairros:[]});
    const txt=await fs.readFile(new URL('../geo/bairros-br.json',import.meta.url),'utf8');
    const base=JSON.parse(txt);
    const bairros=base?.[uf]?.[cidade]||[];
    res.setHeader('Cache-Control','public, max-age=3600, s-maxage=86400');
    return res.status(200).json({ok:true,uf,cidade,bairros});
  }catch(e){
    return res.status(500).json({ok:false,bairros:[],error:e.message||String(e)});
  }
}
