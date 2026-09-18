import {cors,dispatch,body,fail} from './_github.js';
export default async function handler(req,res){
  if(req.method==='OPTIONS'){cors(req,res);return res.status(204).end()}
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  if(!cors(req,res)) return res.status(403).json({ok:false,error:'Origem nao permitida'});
  try{
    const b=body(req),nicho=String(b.nicho||'').trim(),cidade=String(b.cidade||'').trim(),bairro=String(b.bairro||'').trim();
    if(!nicho||!cidade) return res.status(400).json({ok:false,error:'Nicho e cidade sao obrigatorios'});
    const max=Math.max(1,Math.min(Number(b.max_results)||80,120));
    await dispatch('update-leads.yml',{nicho,cidade,bairro,max_results:String(max)});
    return res.status(202).json({ok:true});
  }catch(e){return fail(res,e)}
}