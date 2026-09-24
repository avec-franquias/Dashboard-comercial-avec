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


const adminPatch = String.raw`
<script>
(function(){
  const MODS=['ativacao','arvore','previsao','taxas','propostas','instagram','clientes','extrator','central','reunioes'];
  function token(){return localStorage.getItem('portal-admin-token')||''}
  async function api(body){
    const opt=body?{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token()},body:JSON.stringify(body)}:{headers:{'Authorization':'Bearer '+token()}};
    const r=await fetch('/api/franquias',opt);let d={};try{d=await r.json()}catch{}
    if(!r.ok)throw new Error(d.error||'Falha ao carregar franquias');
    return d;
  }
  function esc2(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function addUi(){
    const abas=document.getElementById('abas');
    if(!abas||document.querySelector('[data-aba="franquias"]'))return;
    const b=document.createElement('button');b.setAttribute('role','tab');b.setAttribute('aria-selected','false');b.dataset.aba='franquias';b.textContent='Franquias';
    const before=[...abas.children].find(x=>x.dataset.aba==='manutencao');abas.insertBefore(b,before||null);
    const sec=document.createElement('section');sec.id='abaFranquias';sec.className='hidden';
    sec.innerHTML='<div class="painel"><h2>Franquias</h2><p class="sub">Cadastre a franquia e vincule usuários que já existem. Ninguém precisa ser recriado.</p><form id="formFranquia" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px"><input class="inp" id="fNome" placeholder="Ex.: Avec Goiás" style="max-width:360px"><button class="btn cheio" id="fCriar">Criar franquia</button></form><div class="msg" id="fMsg"></div><div id="listaFranquias"></div></div>';
    const main=document.querySelector('#telaPortal main.conteudo')||document.querySelector('main.conteudo'); if(main)main.appendChild(sec);
    b.onclick=()=>{document.querySelectorAll('#abas [data-aba]').forEach(x=>x.setAttribute('aria-selected',x===b?'true':'false'));document.querySelectorAll('main.conteudo>section[id^="aba"]').forEach(x=>x.classList.add('hidden'));sec.classList.remove('hidden');carregar()};
    document.getElementById('formFranquia').onsubmit=async e=>{e.preventDefault();const nome=document.getElementById('fNome').value.trim();if(!nome)return;try{await api({action:'create',nome});document.getElementById('fNome').value='';await carregar()}catch(err){document.getElementById('fMsg').textContent=err.message}};
  }
  function modsHtml(login,mods){
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">'+MODS.map(m=>'<label style="font-size:12px"><input type="checkbox" data-mod="'+m+'" '+((mods||[]).includes(m)?'checked':'')+'> '+m+'</label>').join('')+'</div>';
  }
  async function carregar(){
    const root=document.getElementById('listaFranquias'); if(!root)return; root.innerHTML='<p class="sub">Carregando...</p>';
    try{
      const d=await api();
      const users=d.usuarios||[];
      const fr=d.franquias||[];
      root.innerHTML=fr.length?'':'<p class="sub">Nenhuma franquia cadastrada.</p>';
      for(const f of fr){
        const vinculados=users.filter(u=>u.franquiaId===f.id);
        const livres=users.filter(u=>u.papel!=='admin'&&(!u.franquiaId||u.franquiaId===f.id));
        const el=document.createElement('div');el.className='painel';el.style.margin='12px 0';el.innerHTML='<h3 style="margin:0 0 6px">'+esc2(f.nome)+'</h3><div style="font-size:12px;color:var(--tinta-suave);margin-bottom:10px">'+esc2(f.id)+'</div><div class="tabela"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Módulos</th><th></th></tr></thead><tbody>'+vinculados.map(u=>'<tr><td><b>'+esc2(u.nome)+'</b><br><small>'+esc2(u.login)+'</small></td><td>'+esc2(u.perfil||u.papel)+'</td><td>'+esc2((u.modulos||[]).join(', '))+'</td><td><button class="btn linha peq" data-unlink="'+esc2(u.login)+'">Desvincular</button></td></tr>').join('')+'</tbody></table></div><div style="border-top:1px solid #eee;margin-top:12px;padding-top:12px"><b>Vincular usuário existente</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><select class="inp" data-user style="min-width:240px"><option value="">Selecione...</option>'+livres.map(u=>'<option value="'+esc2(u.login)+'">'+esc2(u.nome)+' ('+esc2(u.login)+')</option>').join('')+'</select><select class="inp" data-perfil><option value="franqueado">Franqueado</option><option value="funcionario">Funcionário</option></select></div><div data-mods>'+modsHtml('',[])+'</div><button class="btn cheio peq" data-link>Vincular</button></div>';
        root.appendChild(el);
        el.querySelector('[data-link]').onclick=async()=>{const login=el.querySelector('[data-user]').value;if(!login)return;const perfil=el.querySelector('[data-perfil]').value;const modulos=[...el.querySelectorAll('[data-mod]:checked')].map(x=>x.dataset.mod);await api({action:'link',franquiaId:f.id,login,perfil,modulos});await carregar()};
        el.querySelectorAll('[data-unlink]').forEach(btn=>btn.onclick=async()=>{await api({action:'unlink',login:btn.dataset.unlink});await carregar()});
      }
    }catch(err){root.innerHTML='<p class="msg erro">'+esc2(err.message)+'</p>'}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addUi,{once:true});else addUi();
  setTimeout(addUi,500);
})();
</script>`;

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
    html=html.replace('</body>',patch+'\n'+coveragePatch+'\n'+adminPatch+'\n'+`
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
