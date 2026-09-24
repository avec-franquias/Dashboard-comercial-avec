import {fail} from '../lib/github.js';
const norm=s=>String(s||'').trim().toLocaleLowerCase('pt-BR');
export default async function handler(req,res){
  try{
    const repo=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
    const branch=process.env.GITHUB_BRANCH||'main';
    const nicho=String(req.query?.nicho||'').trim(),cidade=String(req.query?.cidade||'').trim(),bairro=String(req.query?.bairro||'').trim();
    const r=await fetch('https://raw.githubusercontent.com/'+repo+'/'+branch+'/extrator-data/latest.json',{headers:{'User-Agent':'avec-portal-api'},cache:'no-store'});
    if(!r.ok) throw new Error('Base de leads indisponivel ('+r.status+')');
    const data=await r.json();
    const run=(data.runs||[]).find(x=>norm(x.query?.nicho)===norm(nicho)&&norm(x.query?.cidade)===norm(cidade)&&norm(x.query?.bairro||'')===norm(bairro||''));
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).json({ok:true,run:run||null,generated_at:data.generated_at||null});
  }catch(e){return fail(res,e)}
}
