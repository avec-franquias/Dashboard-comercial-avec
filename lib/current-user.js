const REPO=process.env.GITHUB_REPOSITORY||'avec-franquias/Dashboard-comercial-avec';
const BRANCH=process.env.GITHUB_BRANCH||'main';
// A signed token may contain the role/franchise from before an administrator's edit.
export async function requireCurrentUser(session){
  const r=await fetch('https://api.github.com/repos/'+REPO+'/contents/usuarios.json?ref='+encodeURIComponent(BRANCH),{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','User-Agent':'avec-portal-api'},cache:'no-store'});
  if(!r.ok)throw Object.assign(new Error('Não foi possível verificar o acesso. Tente novamente.'),{status:503});
  const j=await r.json(),db=JSON.parse(Buffer.from(j.content,'base64').toString('utf8'));
  const u=(db.usuarios||[]).find(u=>u.login===session.login);
  if(!u?.ativo||u.papel!==session.papel||(u.franquiaId||null)!==(session.franquiaId||null))throw Object.assign(new Error('Seu acesso foi atualizado. Entre novamente no Portal.'),{status:401});
  return u;
}
