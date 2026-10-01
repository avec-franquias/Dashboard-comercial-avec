(function(){
  const el=id=>document.getElementById(id);
  async function enviar(body){
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
    try{
      const r=await fetch((window.PORTAL_API_BASE||'')+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});
      const d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||'Não foi possível concluir. Tente novamente.');
      return d;
    }finally{clearTimeout(timer);}
  }
  document.addEventListener('click',function(e){
    if(!e.target.closest('#lnkEsqueci'))return;
    e.preventDefault();e.stopImmediatePropagation();
    const box=el('txtEsqueci');
    if(!el('solicitarRecuperacao')){
      const p=box.querySelector('p');
      if(p)p.textContent='Informe seu usuário acima e solicite à franqueadora uma nova senha.';
      const btn=document.createElement('button');btn.type='button';btn.id='solicitarRecuperacao';btn.className='btn linha bloco';btn.textContent='Solicitar redefinição de senha';
      const msg=document.createElement('div');msg.className='msg';msg.setAttribute('role','status');
      box.prepend(btn,msg);
      btn.onclick=async function(){
        const login=String(el('usuario').value||'').trim().toLowerCase();
        if(!login){msg.textContent='Informe seu usuário no campo acima.';el('usuario').focus();return;}
        btn.disabled=true;msg.textContent='Registrando solicitação…';
        try{const d=await enviar({action:'request-password-reset',login});msg.textContent=d.message;}
        catch(err){msg.textContent=err.name==='AbortError'?'O servidor demorou a responder. Tente novamente.':err.message;}
        finally{btn.disabled=false;}
      };
    }
    box.classList.toggle('hidden');
  },true);
  document.addEventListener('submit',async function(e){
    if(e.target.id!=='formRecuperar')return;
    e.preventDefault();e.stopImmediatePropagation();
    const msg=el('msgRecuperar'),btn=e.target.querySelector('button:not([type])');
    if(btn)btn.disabled=true;
    msg.textContent='Redefinindo senha…';
    try{
      const d=await enviar({action:'recover-password',login:el('rcLogin').value,codigo:el('rcCodigo').value,senha:el('rcSenha').value});
      el('rcCodigo').value='';el('rcSenha').value='';msg.textContent=d.message;
    }catch(err){msg.textContent=err.name==='AbortError'?'O servidor demorou a responder. Tente novamente.':err.message;}
    finally{if(btn)btn.disabled=false;}
  },true);
})();
