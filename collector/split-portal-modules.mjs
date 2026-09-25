import fs from 'node:fs';
import path from 'node:path';

const indexPath='index.html';
let s=fs.readFileSync(indexPath,'utf8');

const re=/(<script type="application\/json" id="modulosEmbutidos">)([\s\S]*?)(<\/script>)/;
const m=s.match(re);
if(!m) throw new Error('modulosEmbutidos nao encontrado');

const mods=JSON.parse(m[2]);
const dir='portal-assets/modulos';
fs.mkdirSync(dir,{recursive:true});

for(const [id,b64] of Object.entries(mods)){
  fs.writeFileSync(path.join(dir,id+'.b64'),String(b64),'utf8');
}

s=s.replace(m[0],m[1]+'{}'+m[3]);

const oldBlock=`let EMBUTIDOS=null;
const embutidos=()=>EMBUTIDOS||(EMBUTIDOS=JSON.parse($('#modulosEmbutidos').textContent));
const decodifica = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));`;

const newBlock=`const MODULO_CACHE=new Map();
const decodifica = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
async function carregaModulo(id){
  if(MODULO_CACHE.has(id)) return MODULO_CACHE.get(id);
  const r=await fetch('/portal-assets/modulos/'+encodeURIComponent(id)+'.b64',{cache:'force-cache'});
  if(!r.ok) throw new Error('Nao foi possivel carregar o modulo '+id+'.');
  const html=decodifica((await r.text()).trim());
  MODULO_CACHE.set(id,html);
  return html;
}`;

if(!s.includes(oldBlock)) throw new Error('Bloco lazy atual nao encontrado');
s=s.replace(oldBlock,newBlock);

s=s.replace(
`function desenhaConteudoAdmin(){
  const box = $('#editorCentralAdmin');
  if (!box) return;
  if (!centralAdminFrame) {
    centralAdminFrame = document.createElement('iframe');
    centralAdminFrame.title = 'Editor da Central do Franqueado';
    centralAdminFrame.setAttribute('allow', 'clipboard-read; clipboard-write');
    centralAdminFrame.srcdoc = decodifica(embutidos().central);
    box.innerHTML = '';
    box.appendChild(centralAdminFrame);
  }
}`,
`async function desenhaConteudoAdmin(){
  const box = $('#editorCentralAdmin');
  if (!box) return;
  if (!centralAdminFrame) {
    const html=await carregaModulo('central');
    centralAdminFrame = document.createElement('iframe');
    centralAdminFrame.title = 'Editor da Central do Franqueado';
    centralAdminFrame.setAttribute('allow', 'clipboard-read; clipboard-write');
    centralAdminFrame.srcdoc = html;
    box.innerHTML = '';
    box.appendChild(centralAdminFrame);
  }
}`);

s=s.replace(
"  if (!m || !embutidos()[id]) { history.replaceState(null, '', location.pathname + location.search); return fechaModulo(); }",
"  if (!m) { history.replaceState(null, '', location.pathname + location.search); return fechaModulo(); }"
);

s=s.replace(
"    fr.srcdoc = portalInjetaEstado(decodifica(embutidos()[m.id]),m.id,estado);",
"    const html=await carregaModulo(m.id);\n    fr.srcdoc = portalInjetaEstado(html,m.id,estado);"
);

if(s.includes('embutidos()[')||s.includes('EMBUTIDOS')){
  throw new Error('Ainda existem referencias antigas a EMBUTIDOS');
}

fs.writeFileSync(indexPath,s,'utf8');
console.log('modulos extraidos:',Object.keys(mods).length);
console.log('index bytes:',Buffer.byteLength(s,'utf8'));
