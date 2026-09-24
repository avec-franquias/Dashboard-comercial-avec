// Compatibilidade de login Vercel.
window.portalLoginServidor = async function(login, senha){
  const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,senha})});
  let d={}; try{d=await r.json()}catch{}
  if(!r.ok) throw new Error(d.error||'Usuario ou senha incorretos');
  return d.usuario;
};
