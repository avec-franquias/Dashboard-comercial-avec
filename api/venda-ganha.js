import {requireCRMUser} from '../lib/crm-access.js';
import {requireCurrentUser} from '../lib/current-user.js';
import crypto from 'node:crypto';

const REPO=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
const BRANCH=process.env.GITHUB_BRANCH||'main';

function cors(req,res){
  const o=req.headers.origin||'*';
  res.setHeader('Access-Control-Allow-Origin',o);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.setHeader('Cache-Control','no-store');
}
function auth(req){
  const secret=process.env.GITHUB_TOKEN||process.env.PORTAL_SESSION_SECRET;
  if(!secret)throw Object.assign(new Error('Chave de sessao indisponivel'),{status:500});
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const [p,s]=token.split('.');
  if(!p||!s)throw Object.assign(new Error('Entre novamente'),{status:401});
  const exp=crypto.createHmac('sha256',secret).update(p).digest('base64url');
  const a=Buffer.from(s),b=Buffer.from(exp);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Object.assign(new Error('Sessao invalida'),{status:401});
  const d=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));
  if(Date.now()>Number(d.exp||0))throw Object.assign(new Error('Sessao expirada'),{status:401});
  if(!d.franquiaId&&d.papel!=='admin')throw Object.assign(new Error('Usuario ainda nao vinculado a uma franquia'),{status:403});
  return d;
}
function safe(s){return String(s||'').toLowerCase().replace(/[^a-z0-9_-]/g,'-').slice(0,80)}
function rid(){return crypto.randomBytes(8).toString('hex')}
async function gh(path,opts={}){
  const t=process.env.GITHUB_TOKEN;
  if(!t)throw Object.assign(new Error('Armazenamento indisponivel'),{status:500});
  const r=await fetch('https://api.github.com/repos/'+REPO+path,{...opts,headers:{
    Authorization:'Bearer '+t,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'Content-Type':'application/json',
    'User-Agent':'avec-portal-api'
  }});
  const x=await r.text(); let j={}; try{j=x?JSON.parse(x):{}}catch{}
  return {ok:r.ok,status:r.status,j};
}
function cardFromLead(lead,dono,u){
  const now=new Date().toISOString();
  return {
    id:rid(), ownerId:dono.id, column:'novo', clientCode:'',
    title:String(lead.title||'Novo cliente'), phone:String(lead.phone||''),
    labels:[], members:[],
    contractDate:String(lead.wonAt||now).slice(0,16),
    firstContactDate:'', startDate:'', dueDate:'',
    painPoint:'', painValidated:false, pontosAtencao:'',
    oportunidades:lead.value ? 'Venda fechada no funil: '+Number(lead.value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '',
    observacoes:String(lead.notes||''),
    checklists:[{id:rid(),name:'BÁSICO',items:['Boas-vindas','Configurações gerais','Agenda','Caixa','Comanda','Fluxo básico de atendimento'].map(text=>({id:rid(),text,done:false}))}],
    uso:[7,15,30].map(dia=>({id:rid(),dia,status:'',nota:'',em:''})),
    attachments:[],
    activity:[{id:rid(),type:'action',at:now,author:String(lead.ownerName||u.login||'Portal'),authorId:dono.id,text:'cliente enviado automaticamente pelo Funil de Vendas'}],
    history:[{at:now,column:'novo'}],
    createdAt:now,updatedAt:now,finishedAt:'',ordem:Date.now(),
    salesOpportunityId:String(lead.salesOpportunityId||'')
  };
}
export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Metodo nao permitido'});
  try{
    const u=req.headers['x-avec-source']==='crm'?await requireCRMUser(req):await requireCurrentUser(auth(req));
    const lead=req.body?.lead||req.body||{};
    if(!lead.salesOpportunityId) return res.status(400).json({ok:false,error:'Oportunidade sem identificador'});
    const solicitado=safe(req.body?.franquiaId||'');
    const franquia=u.papel==='admin'?(solicitado||safe('admin-'+u.login)):safe(u.franquiaId);
    if(!franquia) return res.status(400).json({ok:false,error:'Franquia indisponivel'});
    const file='franquias/'+franquia+'/ativacao.json';

    for(let tentativa=0;tentativa<3;tentativa++){
      const cur=await gh('/contents/'+file+'?ref='+encodeURIComponent(BRANCH));
      let dados={db:{users:[],cards:[]}};
      if(cur.ok){
        const doc=JSON.parse(Buffer.from(cur.j.content,'base64').toString('utf8'));
        dados=doc&&doc.dados&&typeof doc.dados==='object'?doc.dados:{db:{users:[],cards:[]}};
      }else if(cur.status!==404){
        throw Object.assign(new Error(cur.j.message||'Falha ao ler Ativacao'),{status:cur.status});
      }
      if(!dados.db||typeof dados.db!=='object')dados.db={users:[],cards:[]};
      if(!Array.isArray(dados.db.users))dados.db.users=[];
      if(!Array.isArray(dados.db.cards))dados.db.cards=[];

      const sid=String(lead.salesOpportunityId);
      const ex=dados.db.cards.find(c=>String(c.salesOpportunityId||'')===sid);
      if(ex)return res.status(200).json({ok:true,duplicado:true,cardId:ex.id});

      const login=String(lead.ownerLogin||u.login||'').toLowerCase();
      let dono=dados.db.users.find(x=>String(x.login||'').toLowerCase()===login);
      if(!dono){
        dono={id:rid(),name:String(lead.ownerName||login||'Franqueado'),login:login||('vendas-'+rid()),role:u.papel==='admin'?'admin':'franqueado',pass:'portal'};
        dados.db.users.push(dono);
      }
      const card=cardFromLead(lead,dono,u);
      dados.db.cards.push(card);
      const doc={franquiaId:franquia,modulo:'ativacao',atualizadoEm:new Date().toISOString(),atualizadoPor:u.login,dados};
      const body={message:'Portal: venda ganha enviada para Ativacao',content:Buffer.from(JSON.stringify(doc,null,2)).toString('base64'),branch:BRANCH};
      if(cur.ok)body.sha=cur.j.sha;
      const out=await gh('/contents/'+file,{method:'PUT',body:JSON.stringify(body)});
      if(out.ok)return res.status(200).json({ok:true,duplicado:false,cardId:card.id,commit:out.j.commit?.sha});
      if(out.status!==409)throw Object.assign(new Error(out.j.message||'Falha ao salvar Ativacao'),{status:out.status});
    }
    throw Object.assign(new Error('Conflito ao salvar Ativacao. Tente novamente.'),{status:409});
  }catch(e){
    return res.status(e.status||500).json({ok:false,error:e.message||'Falha ao enviar para Ativacao'});
  }
}
