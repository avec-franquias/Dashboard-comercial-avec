import fs from 'node:fs';

const path='index.html';
let s=fs.readFileSync(path,'utf8');

const decl="const EMBUTIDOS = JSON.parse($('#modulosEmbutidos').textContent);";
const lazy="let EMBUTIDOS=null;\nconst embutidos=()=>EMBUTIDOS||(EMBUTIDOS=JSON.parse($('#modulosEmbutidos').textContent));";

if(!s.includes(decl) && !s.includes("const embutidos=()=>")){
  throw new Error('Declaracao de EMBUTIDOS nao encontrada');
}
if(s.includes(decl)) s=s.replace(decl,lazy);

s=s.replaceAll('EMBUTIDOS.central','embutidos().central');
s=s.replaceAll('EMBUTIDOS[id]','embutidos()[id]');

fs.writeFileSync(path,s,'utf8');
console.log('lazy modules enabled');

// trigger optimization
