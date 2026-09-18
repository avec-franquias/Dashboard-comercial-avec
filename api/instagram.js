import {cors,dispatch,body,fail} from './_github.js';
export default async function handler(req,res){
  if(req.method==='OPTIONS'){cors(req,res);return res.status(204).end()}
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  if(!cors(req,res)) return res.status(403).json({ok:false,error:'Origem nao permitida'});
  try{
    const b=body(req);
    const nicho=String(b.nicho||'').trim(),uf=String(b.uf||'').trim().toUpperCase(),cidade=String(b.cidade||'').trim(),bairro=String(b.bairro||'').trim(),palavra=String(b.palavra_chave||'').trim();
    if(!nicho&&!cidade&&!palavra) return res.status(400).json({ok:false,error:'Informe nicho, cidade ou palavra-chave'});
    const limite=Math.max(1,Math.min(Number(b.limite)||100,200));
    await dispatch('update-instagram.yml',{nicho,uf,cidade,bairro,palavra_chave:palavra,limite:String(limite)});
    return res.status(202).json({ok:true});
  }catch(e){return fail(res,e)}
}