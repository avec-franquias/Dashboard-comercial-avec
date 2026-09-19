import {fail} from './_github.js';
const norm=s=>String(s||'').trim().toLocaleLowerCase('pt-BR');
export default async function handler(req,res){
  try{
    const token=process.env.GITHUB_TOKEN;
    const repo=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
    const nicho=String(req.query?.nicho||'').trim(),uf=String(req.query?.uf||'').trim(),cidade=String(req.query?.cidade||'').trim(),bairro=String(req.query?.bairro||'').trim(),palavra=String(req.query?.palavra_chave||'').trim();
    const r=await fetch('https://api.github.com/repos/'+repo+'/contents/instagram-data/latest.json?ref=main',{
      headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'avec-portal-api'},
      cache:'no-store'
    });
    if(!r.ok) throw new Error('Base do Instagram indisponivel ('+r.status+')');
    const data=await r.json();
    const run=(data.runs||[]).find(x=>
      norm(x.query?.nicho)===norm(nicho)&&norm(x.query?.uf)===norm(uf)&&
      norm(x.query?.cidade)===norm(cidade)&&norm(x.query?.bairro||'')===norm(bairro||'')&&
      norm(x.query?.palavra_chave||'')===norm(palavra||'')
    );
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).json({ok:true,run:run||null});
  }catch(e){return fail(res,e)}
}
