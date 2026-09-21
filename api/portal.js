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
            '<div class="campo"><label>Nicho</label><select id="nicho"></select></div>',
            '<div class="campo"><label>Fonte</label><select id="fonte"><option value="ambos" selected>Google + Instagram</option><option value="google">Google Maps</option><option value="instagram">Instagram</option></select></div><div class="campo"><label>Nicho</label><select id="nicho"></select></div>'
          )
          .replace(
            "function bairroReal(){return $('#bairro').value==='Todos os bairros'?'':$('#bairro').value}",
            "function bairroReal(){return $('#bairro').value==='Todos os bairros'?'':$('#bairro').value}\nfunction fonteAtual(){return $('#fonte')?.value||'ambos'}\nfunction cidadeSemUF(){return String($('#cidade').value||'').replace(/,\\s*[A-Z]{2}$/,'').trim()}\nfunction ufAtual(){return String($('#estado').value||String($('#cidade').value||'').split(',').pop()||'').trim().toUpperCase()}\nfunction mapInstagramLead(x){const contato=x.whatsapp||x.phone||'';return {place_id:'ig:'+String(x.username||x.name||Math.random()),name:x.name||('@'+(x.username||'Instagram')),category:'Instagram',phone:contato,address:[x.city||cidadeSemUF(),ufAtual()].filter(Boolean).join(', '),website:x.website||'',rating:'',maps_url:x.profile_url||'',profile_url:x.profile_url||'',instagram:x.username||'',source:'Instagram',whatsapp:contato}}"
          )
          .replace(
            "function whatsLead(x){const n=phoneBR(x.phone);if(!n)return'<span class=\"muted\">Sem telefone</span>';",
            "function whatsLead(x){const n=phoneBR(x.whatsapp||x.phone);if(!n)return'<span class=\"muted\">Sem telefone</span>';"
          )
          .replace(
            "'<tr><td><span class=\"pill '+(st==='Novo'?'novo':'')+'\">'+st+'</span></td><td><b>'+esc(x.name)+'</b><div class=\"muted\"><a href=\"'+esc(x.maps_url)+'\" target=\"_blank\" rel=\"noopener\">Google Maps</a></div></td><td>'+esc(x.category||'—')+'</td>",
            "'<tr><td><span class=\"pill '+(st==='Novo'?'novo':'')+'\">'+st+'</span></td><td><b>'+esc(x.name)+'</b><div class=\"muted\">'+(x.maps_url?'<a href=\"'+esc(x.maps_url)+'\" target=\"_blank\" rel=\"noopener\">'+esc(x.source||'Google Maps')+'</a>':esc(x.source||'Google Maps'))+'</div></td><td>'+esc(x.category||'—')+'</td>"
          )
          .replace(
            "async function buscarAgora(){\n const nicho=$('#nicho').value,cidade=$('#cidade').value,bairro=bairroReal();\n const existente=findRun();\n if(existente){show();return}",
            "async function buscarAgora(){\n const nicho=$('#nicho').value,cidade=$('#cidade').value,bairro=bairroReal(),fonte=fonteAtual();\n const existente=fonte==='google'?findRun():null;\n if(existente){show();return}"
          )
          .replace(
            "if(!parent.portalSolicitarExtracao) throw new Error('Atualize o Portal para habilitar novas coletas.');\n   const inicio=Date.now();\n   await parent.portalSolicitarExtracao({nicho,cidade,bairro,max_results:80});\n   btn.textContent='Coletando...'; $('#atualizado').textContent='Pesquisa enviada. A coleta está rodando no GitHub.';",
            "const ig=parent.portalSolicitarInstagram,gm=parent.portalSolicitarExtracao;if((fonte==='google'||fonte==='ambos')&&!gm)throw new Error('Atualize o Portal para habilitar Google Maps.');if((fonte==='instagram'||fonte==='ambos')&&!ig)throw new Error('Atualize o Portal para habilitar Instagram.');\n   const inicio=Date.now();\n   const tarefas=[];if(fonte==='google'||fonte==='ambos')tarefas.push(gm({nicho,cidade,bairro,max_results:80}));if(fonte==='instagram'||fonte==='ambos')tarefas.push(ig({nicho,uf:ufAtual(),cidade:cidadeSemUF(),bairro,palavra_chave:'',limite:100}));await Promise.all(tarefas);\n   btn.textContent='Coletando...'; $('#atualizado').textContent='Buscando em '+(fonte==='ambos'?'Google Maps + Instagram':fonte==='google'?'Google Maps':'Instagram')+'...';"
          )
          .replace(
            "for(let i=0;i<80;i++){\n     await new Promise(r=>setTimeout(r,15000));\n     try{const rr=await fetch('/api/data-leads?ts='+Date.now(),{cache:'no-store'});if(rr.ok){DATA=await rr.json();renderCoverage();const achou=findRun();if(achou&&new Date(achou.finished_at||0).getTime()>=inicio-60000){show();return}}}catch{}\n   }",
            "for(let i=0;i<100;i++){\n     await new Promise(r=>setTimeout(r,3000));\n     try{let mapRun=null,igRun=null;if(fonte==='google'||fonte==='ambos'){const qs=new URLSearchParams({nicho,cidade,bairro});const rr=await fetch('/api/query-leads?'+qs+'&ts='+Date.now(),{cache:'no-store'});if(rr.ok){const j=await rr.json();if(j.run&&new Date(j.run.finished_at||0).getTime()>=inicio-60000)mapRun=j.run}}if(fonte==='instagram'||fonte==='ambos'){const iq=new URLSearchParams({nicho,uf:ufAtual(),cidade:cidadeSemUF(),bairro,palavra_chave:''});const ir=await fetch('/api/query-instagram?'+iq+'&ts='+Date.now(),{cache:'no-store'});if(ir.ok){const j=await ir.json();if(j.run&&new Date(j.run.finished_at||0).getTime()>=inicio-60000)igRun=j.run}}const pronto=(fonte==='google'&&mapRun)||(fonte==='instagram'&&igRun)||(fonte==='ambos'&&mapRun&&igRun);if(pronto){let leads=[];if(mapRun)leads.push(...(mapRun.leads||[]).map(x=>({...x,source:'Google Maps'})));if(igRun)leads.push(...(igRun.results||[]).map(mapInstagramLead));const seen=new Set();leads=leads.filter(x=>{const k=norm(x.name)+'|'+phoneBR(x.whatsapp||x.phone||'')+'|'+norm(x.address||'');if(seen.has(k))return false;seen.add(k);return true});current={query:{nicho,cidade,bairro},leads,total:leads.length,new_count:(mapRun?.new_count||0)+(igRun?.new_count||0),new_ids:[...(mapRun?.new_ids||[]),...(igRun?.new_usernames||[]).map(x=>'ig:'+x)],finished_at:new Date().toISOString()};const oldFind=findRun;$('#total').textContent=leads.length+' leads';$('#novos').textContent=current.new_count+' novos';$('#atualizado').textContent='Atualizado '+new Date().toLocaleString('pt-BR');$('#csv').disabled=!leads.length;const newIds=new Set(current.new_ids||[]);$('#tbody').innerHTML=leads.length?leads.map(x=>{const st=newIds.has(x.place_id)?'Novo':'Conhecido';return '<tr><td><span class=\"pill '+(st==='Novo'?'novo':'')+'\">'+st+'</span></td><td><b>'+esc(x.name)+'</b><div class=\"muted\">'+(x.maps_url?'<a href=\"'+esc(x.maps_url)+'\" target=\"_blank\" rel=\"noopener\">'+esc(x.source||'Google Maps')+'</a>':esc(x.source||'Google Maps'))+'</div></td><td>'+esc(x.category||'—')+'</td><td>'+esc(x.whatsapp||x.phone||'—')+'</td><td>'+esc(x.address||'—')+'</td><td>'+(x.website?'<a href=\"'+esc(x.website)+'\" target=\"_blank\" rel=\"noopener\">Abrir</a>':'—')+'</td><td>'+esc(x.rating||'—')+'</td><td>'+whatsLead(x)+'</td></tr>'}).join(''):'<tr><td colspan=\"8\" class=\"empty\">Nenhum lead encontrado nesta pesquisa.</td></tr>';return}}catch(e){console.warn('Acompanhamento da busca:',e)}}"
          )
          .replace(
            "function exportCsv(){const leads=current?.leads||[];",
            "function exportCsv(){const leads=current?.leads||[];"
          )
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
          .replace('<h1>Extrator de Instagram</h1><div class="sub">Encontre novos negócios e organize oportunidades a partir de perfis públicos.</div>',
                   '<h1>Extrator de Leads</h1><div class="sub">Encontre negócios no Instagram, Google Maps ou nas duas fontes.</div>')
          .replace('<div class="grid">\n<div class="campo"><label>Nicho</label>',
                   '<div class="grid">\n<div class="campo"><label>Fonte</label><select id="fonte"><option value="instagram">Instagram</option><option value="google">Google Maps</option><option value="ambos" selected>Google + Instagram</option></select></div>\n<div class="campo"><label>Nicho</label>')
          .replace('function bodyAtual(){return {nicho:',
                   "function fonteAtual(){return $('#fonte')?.value||'ambos'}\nfunction phoneBR(v){let n=String(v||'').replace(/\\D/g,'');if(n.startsWith('0'))n=n.replace(/^0+/,'');if(n.length===10||n.length===11)n='55'+n;return n}\nfunction mapLead(x,cidade){const n=phoneBR(x.phone);return {username:'',name:x.name||'',followers:null,type:x.category||'Google Maps',whatsapp:n,phone:x.phone||'',email:'',website:x.website||'',city:cidade||'',last_post:'',profile_url:x.maps_url||'',source:'Google Maps',address:x.address||'',rating:x.rating||''}}\nfunction bodyAtual(){return {nicho:")
          .replace("const solicitar=parentFn('portalSolicitarInstagram');",
                   "const fonte=fonteAtual(); const solicitarIG=parentFn('portalSolicitarInstagram'),solicitarMaps=parentFn('portalSolicitarExtracao'); const solicitar=fonte==='google'?solicitarMaps:solicitarIG;")
          .replace("if(!solicitar){$('#msg').textContent='Atualize o Portal para iniciar buscas pelo sistema.';return}",
                   "if(!solicitar||(fonte==='ambos'&&(!solicitarIG||!solicitarMaps))){$('#msg').textContent='Atualize o Portal para iniciar as buscas.';botao.disabled=false;return}")
          .replace("await solicitar(body);",
                   "if(fonte==='instagram') await solicitarIG(body); else if(fonte==='google') await solicitarMaps({nicho:body.nicho,cidade:body.cidade+', '+body.uf,bairro:body.bairro,max_results:body.limite}); else await Promise.all([solicitarIG(body),solicitarMaps({nicho:body.nicho,cidade:body.cidade+', '+body.uf,bairro:body.bairro,max_results:body.limite})]);")
          .replace("botao.textContent='Coletando...';$('#msg').textContent='Busca enviada. Aguardando o sistema iniciar a coleta...';",
                   "botao.textContent='Coletando...';$('#msg').textContent='Busca enviada. Procurando leads em '+(fonte==='ambos'?'Google Maps e Instagram':fonte==='google'?'Google Maps':'Instagram')+'...';")
          .replace("const base=await lerBase();\n       const run=(base.runs||[]).find(r=>mesmaBusca(r.query,body));\n       const done=run&&Date.parse(run.finished_at||0)>=before-5000;\n       if(done){ultimoRun=run;render(body,run);$('#msg').textContent='Busca concluída: '+dados.length+' perfil(is) encontrado(s).';botao.disabled=false;botao.textContent='Buscar perfis';return}",
                   "let igRun=null,mapRun=null; if(fonte!=='google'){const base=await lerBase();igRun=(base.runs||[]).find(r=>mesmaBusca(r.query,body));if(!(igRun&&Date.parse(igRun.finished_at||0)>=before-5000))igRun=null} if(fonte!=='instagram'){const qs=new URLSearchParams({nicho:body.nicho,cidade:body.cidade+', '+body.uf,bairro:body.bairro});const mr=await fetch('/api/query-leads?'+qs.toString()+'&t='+Date.now(),{cache:'no-store'});if(mr.ok){const mj=await mr.json();if(mj.run&&Date.parse(mj.run.finished_at||0)>=before-5000)mapRun=mj.run}} const done=(fonte==='instagram'&&igRun)||(fonte==='google'&&mapRun)||(fonte==='ambos'&&igRun&&mapRun); if(done){let results=[];if(igRun)results.push(...(igRun.results||[]).map(x=>({...x,source:'Instagram'})));if(mapRun)results.push(...(mapRun.leads||[]).map(x=>mapLead(x,body.cidade)));const seen=new Set();results=results.filter(x=>{const k=norm(x.name||x.username)+'|'+norm(x.phone||x.whatsapp||x.address||'');if(seen.has(k))return false;seen.add(k);return true});const run={results,total:results.length,new_usernames:igRun?.new_usernames||[],finished_at:new Date().toISOString()};ultimoRun=run;render(body,run);$('#msg').textContent='Busca concluída: '+dados.length+' lead(s) encontrado(s).';botao.disabled=false;botao.textContent='Buscar leads';return}")
          .replaceAll('Buscar perfis','Buscar leads')
          .replaceAll('Buscando perfis no Instagram...','Buscando leads...')
          .replaceAll('Perfis encontrados','Leads encontrados')
          .replaceAll('Perfis analisados','Leads analisados')
          .replaceAll('Quantidade máxima de perfis','Quantidade máxima de leads')
          .replaceAll('Nenhum perfil encontrado para esta busca.','Nenhum lead encontrado para esta busca.')
          .replaceAll('GitHub','sistema');
      }
      if(id==='clientes'){
        src=src
          .replaceAll('clientes-enrichment/latest.json','/api/data-clientes')
          .replaceAll('GitHub','sistema');
      }
      if(id==='extrator'){
        const hideCoverageInsideModule=`
<style>
/* Vercel: remove painel lateral de monitoramento/cobertura e libera largura do extrator */
body:has([data-coverage-panel]) [data-coverage-panel]{display:none!important}
</style>
<script>
(function(){
  function removeCoverage(){
    const all=[...document.querySelectorAll('div,section,aside,article')];
    const candidates=all.filter(el=>{
      const t=(el.innerText||'').replace(/\\s+/g,' ').trim();
      return t.length>0 && t.length<4000 &&
        /MONITORAMENTO/i.test(t) && /Cobertura/i.test(t) &&
        (/Regi(?:ões|oes) que o (?:GitHub Actions|sistema) j[aá] varreu/i.test(t) || /Nenhuma cobertura registrada/i.test(t));
    });
    if(!candidates.length) return;
    candidates.sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length);
    const panel=candidates[0];
    panel.setAttribute('data-coverage-panel','1');
    panel.style.setProperty('display','none','important');
    const parent=panel.parentElement;
    if(parent){
      parent.style.setProperty('grid-template-columns','minmax(0,1fr)','important');
      parent.style.setProperty('display','block','important');
      [...parent.children].forEach(ch=>{if(ch!==panel){ch.style.setProperty('width','100%','important');ch.style.setProperty('max-width','none','important')}});
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',removeCoverage,{once:true}); else removeCoverage();
  new MutationObserver(removeCoverage).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(removeCoverage,100); setTimeout(removeCoverage,500); setTimeout(removeCoverage,1500);
})();
</script>`;
        if(!src.includes('data-coverage-panel')){
          src=src.replace('</body>',hideCoverageInsideModule+'\\n</body>');
        }
        if(!src.includes('id="fonte"')){
          src=src.replace(
            /(<div class="filtros">\s*)/,
            '$1<div class="campo"><label>Fonte</label><select id="fonte"><option value="ambos" selected>Google + Instagram</option><option value="google">Google Maps</option><option value="instagram">Instagram</option></select></div>'
          );
        }
        src=src.replace(
          '<h1>Extrator de Leads</h1>',
          '<h1>Extrator de Leads <span style="font-size:12px;vertical-align:middle;background:#ECEAFE;color:#3F35B8;border-radius:999px;padding:4px 8px;font-weight:700">v2</span></h1>'
        );
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
  const f=document.getElementById('formLogin');
  if(!f) return;
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
    html=html.replace('</body>',patch+'\n'+coveragePatch+'\n'+adminPatch+'\n</body>');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).send(html);
  }catch(e){
    return res.status(500).send('Falha ao carregar o Portal: '+(e.message||String(e)));
  }
}
