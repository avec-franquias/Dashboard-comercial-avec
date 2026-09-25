import fs from 'node:fs/promises';

function patchModulos(html){
  const re=/<script type="application\/json" id="modulosEmbutidos">([\s\S]*?)<\/script>/;
  const m=html.match(re);
  if(!m) return html;
  try{
    const mods=JSON.parse(m[1]);
    for(const id of ['extrator','instagram','clientes']){
      if(!mods[id]) continue;
      let src=Buffer.from(mods[id],'base64').toString('utf8');
      if(id==='extrator'){
        src=src
          .replaceAll('extrator-data/latest.json','/api/data-leads')
          .replace(
            "const base=await carregarBaseBairros();\n      locais=base?.[uf]?.[chaveGeo(nome)]||[];",
            "const br=await fetch('/api/bairros?uf='+encodeURIComponent(uf)+'&cidade='+encodeURIComponent(nome),{cache:'force-cache'});const bj=br.ok?await br.json():{bairros:[]};locais=bj.bairros||[];"
          )
          .replace(
            "try{\n      osm=await bairrosOSM(nome,uf);\n    }catch(err){ console.warn('Base complementar de bairros:',err); }",
            "if(!locais.length){opts('#bairro',['Todos os bairros'],'Todos os bairros');$('#bairro').disabled=false;setTimeout(async()=>{try{const extra=await bairrosOSM(nome,uf);if(extra.length){const lista=[...new Set([...extra,...conhecidos])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));opts('#bairro',['Todos os bairros',...lista],'Todos os bairros')}}catch(err){console.warn('Base complementar de bairros:',err)}},0);}"
          )
          .replace(
            "const base=await carregarBaseBairros();\n      locais=base?.[uf]?.[chaveGeo(nome)]||[];",
            "const br=await fetch('/api/bairros?uf='+encodeURIComponent(uf)+'&cidade='+encodeURIComponent(nome),{cache:'force-cache'}); const bj=br.ok?await br.json():{bairros:[]}; locais=bj.bairros||[];"
          )
          .replace(
            "try{\n      const base=await carregarBaseBairros();\n      locais=base?.[uf]?.[chaveGeo(nome)]||[];\n    }catch(err){ console.warn('Base local de bairros:',err); }\n    try{\n      osm=await bairrosOSM(nome,uf);\n    }catch(err){ console.warn('Base complementar de bairros:',err); }",
            "try{\n      const base=await carregarBaseBairros();\n      locais=base?.[uf]?.[chaveGeo(nome)]||[];\n      if(locais.length){opts('#bairro',['Todos os bairros',...locais],'Todos os bairros');$('#bairro').disabled=false;}\n    }catch(err){ console.warn('Base local de bairros:',err); }\n    if(!locais.length){try{\n      osm=await bairrosOSM(nome,uf);\n    }catch(err){ console.warn('Base complementar de bairros:',err); }}"
          )
          .replace(
            "for(let i=0;i<80;i++){\n     await new Promise(r=>setTimeout(r,15000));\n     try{const rr=await fetch('/api/data-leads?ts='+Date.now(),{cache:'no-store'});if(rr.ok){DATA=await rr.json();renderCoverage();const achou=findRun();if(achou&&new Date(achou.finished_at||0).getTime()>=inicio-60000){show();return}}}catch{}\n   }",
            "for(let i=0;i<100;i++){\n     await new Promise(r=>setTimeout(r,3000));\n     try{const qs=new URLSearchParams({nicho,cidade,bairro});const rr=await fetch('/api/query-leads?'+qs.toString()+'&ts='+Date.now(),{cache:'no-store'});if(rr.ok){const j=await rr.json();const achou=j.run;if(achou&&new Date(achou.finished_at||0).getTime()>=inicio-60000){const arr=DATA.runs||(DATA.runs=[]);const k=arr.findIndex(r=>norm(r.query?.nicho)===norm(nicho)&&norm(r.query?.cidade)===norm(cidade)&&norm(r.query?.bairro||'')===norm(bairro||''));if(k>=0)arr[k]=achou;else arr.push(achou);renderCoverage();show();return}}}catch{}\n   }"
          )
          .replaceAll('Pesquisa enviada. A coleta está rodando no GitHub.','Pesquisa enviada. Estamos buscando os leads.')
          .replaceAll('Pesquisa enviada. A coleta estÃ¡ rodando no GitHub.','Pesquisa enviada. Estamos buscando os leads.')
          .replaceAll('rodando no GitHub','em processamento')
          .replaceAll('GitHub','sistema');
      }
      if(id==='extrator'){
        const bairroFix = `
<script>
(function(){
  async function carregarBairrosPortal(){
    const cidade=document.getElementById('cidade');
    const estado=document.getElementById('estado');
    const bairro=document.getElementById('bairro');
    if(!cidade||!estado||!bairro) return;
    const ESTADOS={AC:'ACRE',AL:'ALAGOAS',AP:'AMAPA',AM:'AMAZONAS',BA:'BAHIA',CE:'CEARA',DF:'DISTRITO FEDERAL',ES:'ESPIRITO SANTO',GO:'GOIAS',MA:'MARANHAO',MT:'MATO GROSSO',MS:'MATO GROSSO DO SUL',MG:'MINAS GERAIS',PA:'PARA',PB:'PARAIBA',PR:'PARANA',PE:'PERNAMBUCO',PI:'PIAUI',RJ:'RIO DE JANEIRO',RN:'RIO GRANDE DO NORTE',RS:'RIO GRANDE DO SUL',RO:'RONDONIA',RR:'RORAIMA',SC:'SANTA CATARINA',SP:'SAO PAULO',SE:'SERGIPE',TO:'TOCANTINS'};
    const norm=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toUpperCase();
    const estadoRaw=String(estado.value||String(cidade.value||'').split(',').pop()||'').trim();
    const estadoNorm=norm(estadoRaw);
    const sigla=(estadoNorm.match(/(?:^|\\s)([A-Z]{2})(?:\\s|$|[-–—])/ )||[])[1];
    const uf=sigla||Object.keys(ESTADOS).find(k=>k===estadoNorm||ESTADOS[k]===estadoNorm)||estadoNorm;
    const nome=String(cidade.value||'').replace(/,\\s*[A-Z]{2}\\s*$/,'').trim();
    if(!uf||!nome){bairro.innerHTML='<option>Todos os bairros</option>';return;}
    const valor=bairro.value;
    bairro.disabled=true;
    bairro.innerHTML='<option>Carregando bairros...</option>';
    try{
      const r=await fetch('/api/bairros?uf='+encodeURIComponent(uf)+'&cidade='+encodeURIComponent(nome)+'&ts='+Date.now(),{cache:'no-store'});
      const j=await r.json();
      const arr=Array.isArray(j.bairros)?j.bairros:[];
      bairro.innerHTML='';
      const todos=document.createElement('option');todos.value='Todos os bairros';todos.textContent='Todos os bairros';bairro.appendChild(todos);
      for(const n of arr){const o=document.createElement('option');o.value=n;o.textContent=n;bairro.appendChild(o);}
      if([...bairro.options].some(o=>o.value===valor)) bairro.value=valor; else bairro.value='Todos os bairros';
    }catch(e){
      bairro.innerHTML='<option>Todos os bairros</option>';
      console.warn('Falha ao carregar bairros',e);
    }finally{bairro.disabled=false;}
  }
  function instalar(){
    const cidade=document.getElementById('cidade'),estado=document.getElementById('estado');
    if(!cidade||!estado)return;
    cidade.addEventListener('change',()=>setTimeout(carregarBairrosPortal,0));
    estado.addEventListener('change',()=>setTimeout(carregarBairrosPortal,150));
    setTimeout(carregarBairrosPortal,100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar,{once:true});else instalar();
})();
<\/script>`;
        src=src.replace('</body>',bairroFix+'</body>');
      }
      if(id==='instagram'){
        src=src
          .replaceAll("const DATA_URL='instagram-data/latest.json';","const DATA_URL='/api/data-instagram';")
          .replaceAll('instagram-data/latest.json','/api/data-instagram')
          .replaceAll('GitHub','sistema');
      }
      if(id==='clientes'){
        src=src
          .replaceAll('clientes-enrichment/latest.json','/api/data-clientes')
          .replaceAll('GitHub','sistema');
      }
      mods[id]=Buffer.from(src,'utf8').toString('base64');
    }
    return html.replace(m[1],JSON.stringify(mods));
  }catch{
    return html;
  }
}




export default async function handler(req,res){
  try{
    let html=await fs.readFile(process.cwd()+'/index.html','utf8');
    html=patchModulos(html);
    html=html
      .replaceAll("nome: 'Extrator de Instagram'","nome: 'Extrator de Leads'")
      .replaceAll("desc: 'Encontre perfis comerciais públicos por nicho e região e organize novos leads.'","desc: 'Busque negócios no Instagram, Google Maps ou nas duas fontes, com contatos quando disponíveis.'");
    const patch=`
<script>
(function(){
  function instalarLoginApi(){
  const f=document.getElementById('formLogin');
  if(!f) return false;
  f.onsubmit=async function(e){
    e.preventDefault();
    const login=String(document.getElementById('usuario')?.value||'').trim().toLowerCase();
    const senha=String(document.getElementById('senha')?.value||'');
    const msg=document.getElementById('msgLogin');
    const btn=document.getElementById('btnEntrar');
    if(msg) msg.textContent='';
    if(!login){if(msg)msg.textContent='Informe seu usuário.';return}
    if(!senha){if(msg)msg.textContent='Informe sua senha.';return}
    if(btn){btn.disabled=true;btn.textContent='Entrando…'}
    try{
      const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,senha})});
      let d={};try{d=await r.json()}catch{}
      if(!r.ok) throw new Error(d.error||'Usuário ou senha incorretos.');
      const u=d.usuario;
      if(d.token) localStorage.setItem('portal-admin-token',d.token);
      if(u?.papel==='admin') sessionStorage.setItem('portal-admin-password',senha);
      const s=document.getElementById('senha'); if(s) s.value='';
      if(typeof aviso==='function') aviso('');
      if(typeof entrarNoPortal!=='function') throw new Error('Portal não carregou corretamente. Atualize a página.');
      entrarNoPortal(u);
    }catch(err){
      if(msg) msg.textContent=err.message||'Não foi possível entrar.';
    }finally{
      if(btn){btn.disabled=false;btn.textContent='Entrar'}
    }
  };
  return true;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',instalarLoginApi,{once:true});
  else instalarLoginApi();
  setTimeout(instalarLoginApi,0);
  setTimeout(instalarLoginApi,250);
  setTimeout(instalarLoginApi,1000);
  setTimeout(instalarLoginApi,2500);
  setInterval(instalarLoginApi,2000);
})();
</script>`;
    html=html
      .replaceAll('Pesquisa enviada. A coleta está rodando no GitHub.','Pesquisa enviada. Estamos buscando os leads.')
      .replaceAll('Pesquisa enviada. A coleta estÃ¡ rodando no GitHub.','Pesquisa enviada. Estamos buscando os leads.')
      .replaceAll('rodando no GitHub','em processamento')
      .replaceAll('GitHub','sistema');
    const coveragePatch=`
<script>
(function(){
 function removerMonitoramento(){
  const els=[...document.querySelectorAll('div,section,aside,article')];
  const matches=els.filter(el=>{
   const t=(el.innerText||'').trim();
   if(t.length>1400) return false;
   return /monitoramento/i.test(t) && (/github actions/i.test(t)||/regi(?:ões|oes)/i.test(t)||/cobertura registrada/i.test(t));
  });
  for(const el of matches){
   const child=[...el.children].some(c=>{
    const t=(c.innerText||'').trim();
    return t.length<1400 && /monitoramento/i.test(t) && (/github actions/i.test(t)||/regi(?:ões|oes)/i.test(t)||/cobertura registrada/i.test(t));
   });
   if(!child) el.style.setProperty('display','none','important');
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',removerMonitoramento,{once:true});else removerMonitoramento();
 setTimeout(removerMonitoramento,300);setTimeout(removerMonitoramento,1200);
})();
</script>`;
    html=html.replace('
<script>
/* FRANQUEADO_FALLBACK_UI_V1 */
(function(){
  const MODS=['ativacao','arvore','previsao','taxas','propostas','instagram','clientes','extrator','central','reunioes'];
  function corrigirUsuario(){
    try{
      const chaves=['usuarioPortal','portalUsuario','usuario','user'];
      for(const area of [sessionStorage,localStorage]){
        for(const k of chaves){
          const raw=area.getItem(k); if(!raw) continue;
          let u; try{u=JSON.parse(raw)}catch{continue}
          if(u&&u.papel==='franqueado'){
            let mudou=false;
            if(!Array.isArray(u.modulos)||!u.modulos.length){u.modulos=[...MODS];mudou=true}
            if(!u.franquiaId){u.franquiaId='acesso-'+String(u.login||'franqueado').toLowerCase().replace(/[^a-z0-9_-]/g,'-');mudou=true}
            if(mudou)area.setItem(k,JSON.stringify(u));
          }
        }
      }
    }catch{}
  }
  corrigirUsuario();
  window.addEventListener('storage',corrigirUsuario);
  setInterval(corrigirUsuario,1000);
})();
</script>
</body>',patch+'\n'+coveragePatch+'\n'+'<script src="/franquias-admin.js"></script>\n'+`
<script>
/* ADMIN_VERCEL_DIRECT_V3 */
(function(){
  function install(){
    if(typeof conectarGithub==='function'){
      conectarGithub=function(){return Promise.reject(new Error('As alterações administrativas são salvas diretamente pelo Portal.'))};
    }
    if(typeof avisoPublicar==='function'){
      avisoPublicar=function(){
        const a=document.getElementById('avisoPublicar'); if(a)a.classList.add('hidden');
        for(const id of ['statusGithub','statusGithub2']){
          const e=document.getElementById(id); if(e)e.textContent='Alterações salvas automaticamente pelo Portal.';
        }
      };
      avisoPublicar();
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  setTimeout(install,300);
})();
</script>`+'\n</body>');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).send(html);
  }catch(e){
    return res.status(500).send('Falha ao carregar o Portal: '+(e.message||String(e)));
  }
}
