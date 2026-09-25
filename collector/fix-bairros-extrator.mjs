import fs from 'node:fs';

const path='index.html';
let s=fs.readFileSync(path,'utf8');
const re=/(<script type="application\/json" id="modulosEmbutidos">)([\s\S]*?)(<\/script>)/;
const m=s.match(re);
if(!m) throw new Error('modulosEmbutidos nao encontrado');

const mods=JSON.parse(m[2]);
let raw=Buffer.from(mods.extrator,'base64').toString('utf8');

const ini=raw.indexOf('async function atualizarBairros(){');
const fim=raw.indexOf('async function build(){',ini);
if(ini<0||fim<0) throw new Error('atualizarBairros nao encontrado');

const newFn=`async function atualizarBairros(){
  const cidadeValor=String($('#cidade').value||'').trim();
  const estadoValor=String($('#estado').value||'').trim();

  const partes=cidadeValor.split(',');
  let nome=cidadeValor;
  let ufCidade='';
  if(partes.length>1){
    const fimCidade=String(partes.pop()||'').trim().toUpperCase();
    const mCidade=fimCidade.match(/[A-Z]{2}/);
    ufCidade=mCidade?mCidade[0]:'';
    nome=partes.join(',').trim();
  }

  const estadoNorm=estadoValor.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase();
  const mEstado=estadoNorm.match(/^([A-Z]{2})(?:\\s|$|[-–—])/);
  const ufEstado=mEstado?mEstado[1]:'';
  const uf=ufCidade||ufEstado;

  opts('#bairro',['Carregando bairros...'],'Carregando bairros...');
  $('#bairro').disabled=true;

  let bairros=[];
  try{
    const r=await fetch('/api/bairros?uf='+encodeURIComponent(uf)+'&cidade='+encodeURIComponent(nome)+'&ts='+Date.now(),{cache:'no-store'});
    if(r.ok){
      const j=await r.json();
      bairros=Array.isArray(j.bairros)?j.bairros:[];
    }
  }catch(e){console.warn('Falha ao carregar bairros',e);}

  const conhecidos=unique('bairro').filter(x=>x&&x!=='Todos os bairros'&&x!=='Carregando bairros...');
  bairros=[...new Set([...bairros,...conhecidos])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));

  opts('#bairro',['Todos os bairros',...bairros],'Todos os bairros');
  $('#bairro').disabled=false;
}

`;

raw=raw.slice(0,ini)+newFn+raw.slice(fim);
mods.extrator=Buffer.from(raw,'utf8').toString('base64');
s=s.replace(m[0],m[1]+JSON.stringify(mods)+m[3]);
fs.writeFileSync(path,s,'utf8');
console.log('ok');

// trigger
