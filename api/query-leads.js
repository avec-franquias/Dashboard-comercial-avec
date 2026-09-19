import {fail} from './_github.js';
const norm=s=>String(s||'').trim().toLocaleLowerCase('pt-BR');
export default async function handler(req,res){
  try{
    const token=process.env.GITHUB_TOKEN;
    const repo=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
    const nicho=String(req.query?.nicho||'').trim();
    const cidade=String(req.query?.cidade||'').trim();
    const bairro=String(req.query?.bairro||'').trim();
    const r=await fetch('https://api.github.com/repos/'+repo+'/contents/extrator-data/latest.json?ref=main',{
      headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'avec-portal-api'},
      cache:'no-store'
    });
    if(!r.ok) throw new Error('Base de leads indisponivel ('+r.status+')');
    const data=await r.json();
    const run=(data.runs||[]).find(x=>
      norm(x.query?.nicho)===norm(nicho)&&
      norm(x.query?.cidade)===norm(cidade)&&
      norm(x.query?.bairro||'')===norm(bairro||'')
    );
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).json({ok:true,run:run||null,generated_at:data.generated_at||null});
  }catch(e){return fail(res,e)}
}
