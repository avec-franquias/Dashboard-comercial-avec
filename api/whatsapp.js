import {cors,dispatch,body,fail} from '../lib/github.js';
export default async function handler(req,res){
  if(req.method==='OPTIONS'){cors(req,res);return res.status(204).end()}
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  if(!cors(req,res)) return res.status(403).json({ok:false,error:'Origem nao permitida'});
  try{
    const b=body(req),cliente_id=String(b.cliente_id||'').trim(),nome=String(b.nome||'').trim(),documento=String(b.documento||'').trim();
    if(!cliente_id||!nome) return res.status(400).json({ok:false,error:'Cliente ID e nome sao obrigatorios'});
    await dispatch('enrich-client.yml',{cliente_id,nome,documento});
    return res.status(202).json({ok:true});
  }catch(e){return fail(res,e)}
}