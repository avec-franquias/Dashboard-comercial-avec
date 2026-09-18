import fs from 'node:fs/promises';

let BASE=null;
function chave(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
}
async function carregar(){
  if(BASE) return BASE;
  const txt=await fs.readFile(new URL('../geo/bairros-br.json',import.meta.url),'utf8');
  BASE=JSON.parse(txt);
  return BASE;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  try{
    const uf=String(req.query?.uf||'').trim().toUpperCase();
    const cidade=String(req.query?.cidade||'').replace(/,\s*[A-Z]{2}$/,'').trim();
    if(!uf||!cidade) return res.status(400).json({ok:false,error:'UF e cidade sao obrigatorios'});
    const db=await carregar();
    const bairros=db?.[uf]?.[chave(cidade)]||[];
    return res.status(200).json({ok:true,uf,cidade,bairros});
  }catch(e){
    return res.status(500).json({ok:false,error:e.message||'Falha ao carregar bairros',bairros:[]});
  }
}
