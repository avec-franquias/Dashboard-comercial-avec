(function(){
  function escHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]})}
  function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
  async function renderRegioes(){
    var $=function(s){return document.querySelector(s)};
    var lista=$("#regioesLista"),msg=$("#regioesMsg"),sel=$("#regioesEstado"),busca=$("#regioesBusca"),qtd=$("#regioesQtd");
    if(!lista||!window.portalRegioesBaseLeads)return;
    if(msg){msg.className="msg";msg.textContent="Carregando cobertura nacional por cidade..."}
    try{
      var data=await window.portalRegioesBaseLeads();
      var geoResp=await fetch(new URL("geo/bairros-br.json",location.href),{cache:"force-cache"});
      var geo=geoResp.ok?await geoResp.json():{};
      var mapa=new Map();
      (data.items||[]).forEach(function(x){
        if(!x.estado||!x.cidade)return;
        mapa.set(x.estado+"|"+norm(x.cidade),{
          total:Number(x.total_leads||x.leads||0),
          google:Number(x.google_leads||0),
          instagram:Number(x.instagram_leads||0),
          ultima:x.ultima_atualizacao||null
        });
      });
      var all=[];
      Object.entries(geo).forEach(function(pair){
        var uf=pair[0],cidades=pair[1]||{};
        Object.keys(cidades).forEach(function(cidadeKey){
          var d=mapa.get(uf+"|"+norm(cidadeKey))||{total:0,google:0,instagram:0,ultima:null};
          all.push({estado:uf,cidade:cidadeKey,total:d.total,google:d.google,instagram:d.instagram,ultima:d.ultima,coletada:d.total>0});
        });
      });
      var estados=Object.keys(geo).sort();
      if(sel){
        var atual=sel.value;
        sel.innerHTML='<option value="">Todos os estados</option>'+estados.map(function(e){return '<option value="'+escHtml(e)+'">'+escHtml(e)+'</option>'}).join("");
        if(estados.indexOf(atual)>=0)sel.value=atual;
      }
      function draw(){
        var uf=sel?sel.value:"",term=(busca?busca.value:"").toLowerCase().trim();
        var rows=all.filter(function(x){return (!uf||x.estado===uf)&&(!term||(x.estado+" "+x.cidade).toLowerCase().includes(term))});
        var total=rows.reduce(function(n,x){return n+x.total},0);
        var google=rows.reduce(function(n,x){return n+x.google},0);
        var instagram=rows.reduce(function(n,x){return n+x.instagram},0);
        var cidadesComDados=rows.filter(function(x){return x.coletada}).length;
        if(qtd)qtd.textContent=rows.length.toLocaleString("pt-BR")+" cidades · "+total.toLocaleString("pt-BR")+" leads";
        lista.innerHTML='<div class="logs-kpis" style="margin:0 0 14px 0">'+
          '<div class="logs-kpi"><b>'+total.toLocaleString("pt-BR")+'</b><span>Total de leads</span></div>'+
          '<div class="logs-kpi"><b>'+google.toLocaleString("pt-BR")+'</b><span>Google Maps</span></div>'+
          '<div class="logs-kpi"><b>'+instagram.toLocaleString("pt-BR")+'</b><span>Instagram</span></div>'+
          '<div class="logs-kpi"><b>'+cidadesComDados.toLocaleString("pt-BR")+' / '+rows.length.toLocaleString("pt-BR")+'</b><span>Cidades com dados</span></div>'+
          '</div>'+
          '<div style="overflow:auto"><table class="logs-table"><thead><tr><th>Estado</th><th>Cidade</th><th>Status</th><th>Total</th><th>Google</th><th>Instagram</th><th>Última atualização</th></tr></thead><tbody>'+
          rows.map(function(x){return '<tr><td>'+escHtml(x.estado)+'</td><td>'+escHtml(x.cidade)+'</td><td>'+(x.coletada?'<b style="color:#16803d">Coletada</b>':'<span class="muted">Pendente</span>')+'</td><td><b>'+x.total.toLocaleString("pt-BR")+'</b></td><td>'+x.google.toLocaleString("pt-BR")+'</td><td>'+x.instagram.toLocaleString("pt-BR")+'</td><td>'+escHtml(x.ultima?new Date(x.ultima).toLocaleString("pt-BR"):"—")+'</td></tr>'}).join("")+
          '</tbody></table></div>';
        if(msg){msg.className="msg";msg.textContent="Atualização por cidade. Google e Instagram aparecem separados, e o total acompanha o filtro aplicado."}
      }
      if(sel)sel.onchange=draw;
      if(busca)busca.oninput=draw;
      draw();
      var btn=$("#regioesAtualizarTodas");
      if(btn)btn.onclick=async function(){
        btn.disabled=true;var old=btn.textContent;btn.textContent="Iniciando fila...";
        if(msg){msg.className="msg";msg.textContent="Iniciando atualização nacional por cidade..."}
        try{
          var token=localStorage.getItem("portal-admin-token")||"";
          var r=await fetch("/api/regions-update",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:"{}",cache:"no-store"});
          var j=await r.json().catch(function(){return {}});
          if(!r.ok||j.ok===false)throw new Error(j.error||"Falha ao iniciar a fila.");
          if(msg){msg.className="msg ok";msg.textContent="Fila iniciada. O sistema seguirá atualizando cidades em pequenos lotes."}
        }catch(e){
          if(msg){msg.className="msg erro";msg.textContent=e.message||"Falha ao iniciar a atualização nacional."}
        }finally{btn.disabled=false;btn.textContent=old}
      };
    }catch(e){
      if(msg){msg.className="msg erro";msg.textContent=e.message||"Falha ao carregar regiões."}
    }
  }
  function install(){
    if(typeof window.desenhaRegioesAdmin==="function"){
      window.desenhaRegioesAdmin=renderRegioes;
      return true;
    }
    return false;
  }
  if(!install()){
    var t=setInterval(function(){if(install())clearInterval(t)},300);
    setTimeout(function(){clearInterval(t)},30000);
  }
})();