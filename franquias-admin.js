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
  function isAdmin(){
    try{
      const s=JSON.parse(localStorage.getItem('portal-sessao')||'null');
      if(s&&s.login){
        const lista=JSON.parse(localStorage.getItem('portal-usuarios')||'[]');
        const u=Array.isArray(lista)?lista.find(x=>x.login===s.login):null;
        if(u) return u.papel==='admin';
      }
    }catch{}
    const papel=(document.getElementById('papelTopo')?.textContent||'').trim().toLowerCase();
    return papel==='administrador';
  }
  function bloquearNaoAdmin(){
    if(isAdmin()) return false;
    const tab=document.querySelector('[data-aba="franquias"]');
    const sec=document.getElementById('abaFranquias');
    if(tab) tab.style.setProperty('display','none','important');
    if(sec) sec.classList.add('hidden');
    if(location.hash==='#franquias') history.replaceState(null,'',location.pathname+location.search);
    return true;
  }
  function addUi(){
    const abas=document.getElementById('abas');
    if(!abas)return;
    if(bloquearNaoAdmin())return;
    const existente=document.querySelector('[data-aba="franquias"]');
    if(existente&&document.getElementById('abaFranquias')){
      const sec=document.getElementById('abaFranquias');
      existente.onclick=()=>{document.querySelectorAll('#abas [data-aba]').forEach(x=>x.setAttribute('aria-selected',x===existente?'true':'false'));document.querySelectorAll('main.conteudo>section[id^="aba"]').forEach(x=>x.classList.add('hidden'));sec.classList.remove('hidden');carregar()};
      const form=document.getElementById('formFranquia');
      if(form)form.onsubmit=async e=>{e.preventDefault();const nome=document.getElementById('fNome').value.trim();if(!nome)return;try{await api({action:'create',nome});document.getElementById('fNome').value='';document.getElementById('fMsg').textContent='';await carregar()}catch(err){document.getElementById('fMsg').textContent=err.message}};
      return;
    }
    const b=document.createElement('button');
    b.setAttribute('role','tab');b.setAttribute('aria-selected','false');b.dataset.aba='franquias';b.textContent='Franquias';
    const before=[...abas.children].find(x=>x.dataset.aba==='manutencao');abas.insertBefore(b,before||null);
    const sec=document.createElement('section');sec.id='abaFranquias';sec.className='hidden';
    sec.innerHTML='<div class="painel"><h2>Franquias</h2><p class="sub">Cadastre a franquia e vincule usuários. As visualizações são definidas no grupo e valem igualmente para todos os usuários vinculados.</p><form id="formFranquia" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px"><input class="inp" id="fNome" placeholder="Ex.: Avec Goiás" style="max-width:360px"><button class="btn cheio" id="fCriar">Criar franquia</button></form><div class="msg" id="fMsg"></div><div id="listaFranquias"></div></div>';
    const main=document.querySelector('#telaPortal main.conteudo')||document.querySelector('main.conteudo');if(main)main.appendChild(sec);
    b.onclick=()=>{document.querySelectorAll('#abas [data-aba]').forEach(x=>x.setAttribute('aria-selected',x===b?'true':'false'));document.querySelectorAll('main.conteudo>section[id^="aba"]').forEach(x=>x.classList.add('hidden'));sec.classList.remove('hidden');carregar()};
    document.getElementById('formFranquia').onsubmit=async e=>{e.preventDefault();const nome=document.getElementById('fNome').value.trim();if(!nome)return;try{await api({action:'create',nome});document.getElementById('fNome').value='';await carregar()}catch(err){document.getElementById('fMsg').textContent=err.message}};
  }
  function modsHtml(mods){return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">'+MODS.map(m=>'<label style="font-size:12px"><input type="checkbox" data-mod="'+m+'" '+((mods||[]).includes(m)?'checked':'')+'> '+m+'</label>').join('')+'</div>'}
  async function carregar(){
    const root=document.getElementById('listaFranquias');if(!root)return;root.innerHTML='<p class="sub">Carregando...</p>';
    try{
      const d=await api(),users=d.usuarios||[],fr=d.franquias||[];
      root.innerHTML=fr.length?'':'<p class="sub">Nenhuma franquia cadastrada.</p>';
      for(const f of fr){
        const vinculados=users.filter(u=>u.franquiaId===f.id);
        const livres=users.filter(u=>u.papel!=='admin'&&(!u.franquiaId||u.franquiaId===f.id));
        const el=document.createElement('div');el.className='painel';el.style.margin='12px 0';
        el.innerHTML='<h3 style="margin:0 0 6px">'+esc2(f.nome)+'</h3><div style="font-size:12px;color:var(--tinta-suave);margin-bottom:10px">'+esc2(f.id)+'</div>'+
        '<div style="border:1px solid #eee;border-radius:10px;padding:10px;margin:8px 0 14px"><b>Visualizações do grupo</b><p class="sub" style="margin:4px 0 8px">Todos os usuários desta franquia recebem exatamente os mesmos módulos.</p><div data-group-mods>'+modsHtml(f.modulos||[])+'</div><button class="btn linha peq" data-save-mods>Salvar visualizações do grupo</button></div>'+
        '<div class="tabela"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Visualizações</th><th></th></tr></thead><tbody>'+vinculados.map(u=>'<tr><td><b>'+esc2(u.nome)+'</b><br><small>'+esc2(u.login)+'</small></td><td>'+esc2(u.perfil||u.papel)+'</td><td>Mesmas do grupo</td><td><button class="btn linha peq" data-unlink="'+esc2(u.login)+'">Desvincular</button></td></tr>').join('')+'</tbody></table></div>'+
        '<div style="border-top:1px solid #eee;margin-top:12px;padding-top:12px"><b>Vincular usuário existente</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><select class="inp" data-user style="min-width:240px"><option value="">Selecione...</option>'+livres.map(u=>'<option value="'+esc2(u.login)+'">'+esc2(u.nome)+' ('+esc2(u.login)+')</option>').join('')+'</select><select class="inp" data-perfil><option value="franqueado">Franqueado</option><option value="funcionario">Funcionário</option></select></div><button class="btn cheio peq" data-link style="margin-top:8px">Vincular</button></div>';
        root.appendChild(el);
        el.querySelector('[data-save-mods]').onclick=async()=>{const modulos=[...el.querySelectorAll('[data-group-mods] [data-mod]:checked')].map(x=>x.dataset.mod);await api({action:'setModules',franquiaId:f.id,modulos});await carregar()};
        el.querySelector('[data-link]').onclick=async()=>{const login=el.querySelector('[data-user]').value;if(!login)return;const perfil=el.querySelector('[data-perfil]').value;await api({action:'link',franquiaId:f.id,login,perfil});await carregar()};
        el.querySelectorAll('[data-unlink]').forEach(btn=>btn.onclick=async()=>{await api({action:'unlink',login:btn.dataset.unlink});await carregar()});
      }
    }catch(err){root.innerHTML='<p class="msg erro">'+esc2(err.message)+'</p>'}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addUi,{once:true});else addUi();
  setTimeout(addUi,500);
  setTimeout(bloquearNaoAdmin,700);
  setTimeout(bloquearNaoAdmin,1800);
})();
