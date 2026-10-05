
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USERS_URL="https://raw.githubusercontent.com/avec-franquias/Dashboard-comercial-avec/main/usuarios.json";
const ALLOWED=new Set(["https://avec-franquias.github.io","https://dashboard-comercial-avec.vercel.app","https://portal.avec.app","https://avec-crm-carteiras.vercel.app"]);
const OPEN_STAGES=["nao_iniciado","primeira_reuniao","follow_up","sem_retorno"];

function h(origin:string){
  const allow=ALLOWED.has(origin)?origin:"https://dashboard-comercial-avec.vercel.app";
  return {"Access-Control-Allow-Origin":allow,"Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"content-type,authorization,x-avec-source,x-avec-portal-token","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"};
}
function clean(v:any,n=500){return String(v??"").trim().slice(0,n)}
function norm(v:any){return clean(v,500).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
function digits(v:any){return String(v??"").replace(/\D/g,"")}
function words(v:any){return norm(v).split(/[^a-z0-9]+/).filter((x:string)=>x.length>2)}
function score(a:any,b:any){const aa=words(a),bb=new Set(words(b));if(!aa.length)return 0;return aa.filter((x:string)=>bb.has(x)).length/aa.length}
async function usersDoc(){const r=await fetch(USERS_URL,{cache:"no-store"});if(!r.ok)throw new Error("Base de usuarios indisponivel");return r.json()}
function franchiseName(db:any,id:string){const f=(db.franquias||[]).find((x:any)=>x.id===id);return f?.nome||id||""}
async function user(login:string){const db=await usersDoc();const key=clean(login,80).toLowerCase();const u=(db.usuarios||[]).find((x:any)=>String(x.login||"").toLowerCase()===key&&x.ativo!==false);return {u,db}}
async function sb(path:string,init:RequestInit={}){return fetch(SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{"apikey":SERVICE_KEY,"Authorization":"Bearer "+SERVICE_KEY,"Content-Type":"application/json","Prefer":"return=representation",...(init.headers||{})}})}
function stageOk(v:any){return ["nao_iniciado","primeira_reuniao","follow_up","sem_retorno","ganho","perdido"].includes(String(v))}
async function verifyAccess(req:Request){
 const source=req.headers.get('x-avec-source');let url='',headers:any={};if(source==='crm'){const token=req.headers.get('authorization')||'';if(!token.startsWith('Bearer '))throw Object.assign(new Error('Entre novamente para acessar o Kanban.'),{status:401});url='https://avec-crm-carteiras.vercel.app/api/crm?action=kanban-access';headers.Cookie='__Host-crm_access='+token.slice(7);}else if(source==='portal'){const portalToken=req.headers.get('x-avec-portal-token')||String(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!portalToken)throw Object.assign(new Error('Entre novamente para acessar o Kanban.'),{status:401});url='https://dashboard-comercial-avec.vercel.app/api/kanban';headers.Authorization='Bearer '+portalToken;headers['Content-Type']='application/json';headers['X-AVEC-Validate']='1';}else throw Object.assign(new Error('Sessão inválida.'),{status:401});
 const r=await fetch(url,{method:source==='portal'?'POST':'GET',headers,body:source==='portal'?JSON.stringify({action:'validate-access'}):undefined,redirect:'error'});if(!r.ok){let detail='';try{detail=(await r.json())?.error||''}catch{}throw Object.assign(new Error(detail||'Acesso não autorizado ao Kanban.'),{status:r.status});}const a=await r.json();if(!a.ok||a.role!=='admin'&&!Array.isArray(a.franchise_ids))throw Object.assign(new Error('Acesso inválido.'),{status:403});return a;
}
function accessQuery(a:any,target:string){if(a.role==='admin')return target?'&franquia_id=eq.'+encodeURIComponent(target):'';if(target&&!a.franchise_ids.includes(target))throw Object.assign(new Error('Franquia não disponível para este acesso.'),{status:403});const ids=target?[target]:a.franchise_ids;if(!ids.length)return '&franquia_id=eq.__none__';if(ids.some((id:string)=>!/^[-a-z0-9_]{1,100}$/.test(id)))throw new Error('Vínculo de franquia inválido.');return '&franquia_id=in.('+ids.map(encodeURIComponent).join(',')+')';}
async function existingMatch(lead:any,db:any,a:any,target:string){
 let phone=digits(lead?.whatsapp||lead?.phone||lead?.telefone);if(phone.length===10||phone.length===11)phone='55'+phone;
 const document=digits(lead?.document||lead?.documento),cid=clean(lead?.client_id||lead?.cliente_id,30),pid=clean(lead?.place_id||lead?.origem_id,240);
 const scope=accessQuery(a,target),fields='id,franquia_id,cliente,telefone,cidade,etapa,criado_por,origem,origem_id';
 const tests:string[]=[];if(phone.length>=10)tests.push('telefone_digits=eq.'+encodeURIComponent(phone), 'telefone_digits=eq.'+encodeURIComponent(phone.startsWith('55')?phone.slice(2):phone));if(document.length>=11)tests.push('documento=eq.'+document);if(/^\d{1,30}$/.test(cid))tests.push('client_id=eq.'+cid);if(pid)tests.push('origem_id=eq.'+encodeURIComponent(pid));
 for(const filter of tests){const r=await sb('portal_vendas_funil?select='+fields+scope+'&'+filter+'&limit=1');if(!r.ok)throw new Error('Falha ao conferir duplicidade.');const x=(await r.json())[0];if(x)return {...x,franquia_nome:franchiseName(db,x.franquia_id),confianca:'identificador'};}return null;
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"",headers=h(origin);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(origin&&!ALLOWED.has(origin))return new Response(JSON.stringify({ok:false,error:"Origem nao autorizada"}),{status:403,headers});
  try{
    if(req.method!=='POST')return new Response(JSON.stringify({ok:false,error:'Método indisponível.'}),{status:405,headers});const access=await verifyAccess(req);const b=await req.json();const db=await usersDoc();const u={login:access.email||access.user_id,nome:access.name||access.email,papel:access.role==='admin'?'admin':'franqueado',franquiaId:access.franchise_ids?.length===1?access.franchise_ids[0]:''};
    const action=clean(b?.action,40).toLowerCase();
    const targetFranchise=clean(b?.franquiaId||u.franquiaId,100);const scope=accessQuery(access,targetFranchise);

    if(action==="list"){
      const r=await sb("portal_vendas_funil?select=*"+scope+"&order=criado_em.desc&limit=1000");
      if(!r.ok)throw new Error(await r.text());
      return new Response(JSON.stringify({ok:true,deals:await r.json(),franquia_id:targetFranchise,franquia_nome:franchiseName(db,targetFranchise)}),{status:200,headers});
    }

    if(action==="match-leads"){
      const leads=Array.isArray(b?.leads)?b.leads.slice(0,120):[];
      const matches=[];
      for(let i=0;i<leads.length;i+=10){
        const chunk=leads.slice(i,i+10);
        matches.push(...await Promise.all(chunk.map((x:any)=>existingMatch(x,db,access,targetFranchise))));
      }
      return new Response(JSON.stringify({ok:true,matches}),{status:200,headers});
    }

    if(action==="create-from-lead"){
      if(!targetFranchise)return new Response(JSON.stringify({ok:false,error:"Franquia nao identificada."}),{status:400,headers});
      const lead=b?.lead||{};
      const exists=await existingMatch(lead,db,access,targetFranchise);
      if(exists)return new Response(JSON.stringify({ok:false,error:"Este cliente ja esta sendo atendido no funil.",existing:exists}),{status:409,headers});
      const r=await sb('rpc/portal_create_sales_lead',{method:'POST',body:JSON.stringify({p_franchise:targetFranchise,p_creator:u.login,p_name:u.nome,p_lead:lead})});if(!r.ok)throw new Error('Não foi possível salvar o lead.');const saved=await r.json();return new Response(JSON.stringify({ok:true,...saved,franquia_nome:franchiseName(db,targetFranchise)}),{status:200,headers});
    }

    if(action==="create"){
      if(!targetFranchise)return new Response(JSON.stringify({ok:false,error:"Franquia nao identificada."}),{status:400,headers});
      const d=b?.deal||{};
      const row={franquia_id:targetFranchise,criado_por:u.login,criado_por_nome:u.nome||u.login,cliente:clean(d.cliente||d.client,300),contato:clean(d.contato||d.contact,200)||null,telefone:clean(d.telefone||d.phone,100)||null,telefone_digits:digits(d.telefone||d.phone)||null,cidade:clean(d.cidade,160)||null,endereco:clean(d.endereco,400)||null,origem:clean(d.origem,40)||"manual",origem_id:clean(d.origem_id,240)||null,valor:Number(d.valor??d.value)||0,etapa:stageOk(d.etapa||d.stage)?String(d.etapa||d.stage):"nao_iniciado",proximo_passo:clean(d.proximo_passo||d.nextStep,400)||null,observacoes:clean(d.observacoes||d.notes,2000)||null,motivo_perda:clean(d.motivo_perda||d.lostReason,200)||null};
      if(!row.cliente)return new Response(JSON.stringify({ok:false,error:"Informe o cliente."}),{status:400,headers});
      const r=await sb("portal_vendas_funil",{method:"POST",body:JSON.stringify(row)});if(!r.ok)throw new Error(await r.text());
      return new Response(JSON.stringify({ok:true,deal:(await r.json())?.[0]}),{status:200,headers});
    }

    const id=clean(b?.id,80);if(!id)return new Response(JSON.stringify({ok:false,error:"Oportunidade invalida."}),{status:400,headers});
    const qr=await sb("portal_vendas_funil?select=*&id=eq."+encodeURIComponent(id)+"&limit=1");if(!qr.ok)throw new Error(await qr.text());
    const current=(await qr.json())?.[0];
    if(!current)return new Response(JSON.stringify({ok:false,error:"Oportunidade nao encontrada."}),{status:404,headers});
    if(access.role!=="admin"&&!access.franchise_ids.includes(current.franquia_id))return new Response(JSON.stringify({ok:false,error:"Sem permissao para esta oportunidade."}),{status:403,headers});

    if(action==="delete"){
      const r=await sb("portal_vendas_funil?id=eq."+encodeURIComponent(id),{method:"DELETE",headers:{"Prefer":"return=minimal"}});if(!r.ok)throw new Error(await r.text());
      return new Response(JSON.stringify({ok:true}),{status:200,headers});
    }
    if(action==="update"){
      const d=b?.deal||{},patch:any={atualizado_em:new Date().toISOString()};
      if(d.cliente!==undefined||d.client!==undefined)patch.cliente=clean(d.cliente??d.client,300);
      if(d.contato!==undefined||d.contact!==undefined)patch.contato=clean(d.contato??d.contact,200)||null;
      if(d.telefone!==undefined||d.phone!==undefined){patch.telefone=clean(d.telefone??d.phone,100)||null;patch.telefone_digits=digits(d.telefone??d.phone)||null}
      if(d.valor!==undefined||d.value!==undefined)patch.valor=Number(d.valor??d.value)||0;
      if(d.etapa!==undefined||d.stage!==undefined){const st=String(d.etapa??d.stage);if(!stageOk(st))return new Response(JSON.stringify({ok:false,error:"Etapa invalida."}),{status:400,headers});patch.etapa=st;if(st==="ganho"&&!current.ganho_em)patch.ganho_em=new Date().toISOString()}
      if(d.proximo_passo!==undefined||d.nextStep!==undefined)patch.proximo_passo=clean(d.proximo_passo??d.nextStep,400)||null;
      if(d.observacoes!==undefined||d.notes!==undefined)patch.observacoes=clean(d.observacoes??d.notes,2000)||null;
      if(d.motivo_perda!==undefined||d.lostReason!==undefined)patch.motivo_perda=clean(d.motivo_perda??d.lostReason,200)||null;
      if(d.ativacao_enviada!==undefined)patch.ativacao_enviada=!!d.ativacao_enviada;
      const r=await sb("portal_vendas_funil?id=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(patch)});if(!r.ok)throw new Error(await r.text());
      return new Response(JSON.stringify({ok:true,deal:(await r.json())?.[0]}),{status:200,headers});
    }
    return new Response(JSON.stringify({ok:false,error:"Acao invalida"}),{status:400,headers});
  }catch(e){return new Response(JSON.stringify({ok:false,error:e instanceof Error?e.message:String(e)}),{status:(e as any)?.status||500,headers})}
});

