from pathlib import Path
p=Path("index.html")
s=p.read_text(encoding="utf-8")
start=s.find("async function alterarPortal(fn, fnManut, mensagem){")
end=s.find("// usuários deste navegador entram na lista do site",start)
if start<0 or end<0: raise SystemExit("bloco nao localizado")
novo="""async function alterarPortal(fn, fnManut, mensagem){
  /* ADMIN_VERCEL_NATIVE_V3 */
  const base=clone(usuarios()), m=clone(MANUT||{});
  if(fn) await fn(base);
  if(fnManut) await fnManut(m);
  const token=localStorage.getItem('portal-admin-token')||'';
  if(!token) throw new Error('Sessao administrativa antiga. Saia e entre novamente no Portal.');
  const r=await fetch('/api/admin-state',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({instalacao:INSTALACAO,usuarios:base,manutencao:m,mensagem:mensagem||'Portal: atualizacao administrativa'})});
  let d={}; try{d=await r.json()}catch{}
  if(!r.ok) throw new Error(d.error||'Nao foi possivel salvar pelo Portal.');
  LISTA=Array.isArray(d.usuarios)?d.usuarios:base;
  MANUT=d.manutencao||m; TEM_ARQUIVO=true; rasc=null;
  try{localStorage.removeItem(RASC)}catch{}
  if(typeof avisoPublicar==='function') avisoPublicar();
  return LISTA;
}
"""
s=s[:start]+novo+s[end:]
s=s.replace("const on = !!(NO_SITE && perfil && perfil.papel === 'admin' && !ghCfg() && (rasc || !TEM_ARQUIVO));","const on = false;")
p.write_text(s,encoding="utf-8")
block=s[start:s.find("// usuários deste navegador entram na lista do site",start)]
assert "/api/admin-state" in block and "conectarGithub()" not in block
print("OK")
