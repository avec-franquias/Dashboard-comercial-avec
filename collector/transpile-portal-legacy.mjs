import fs from 'node:fs';
import { transformSync } from 'esbuild';

const file='index.html';
let html=fs.readFileSync(file,'utf8');

html=html.replace(/<script(?![^>]*type=["']application\/json["'])([^>]*)>([\s\S]*?)<\/script>/gi,(full,attrs,code)=>{
  if(/\bsrc\s*=/.test(attrs)) return full;
  if(!code.trim()) return full;
  const out=transformSync(code,{
    loader:'js',
    target:['chrome70','edge79'],
    format:'default',
    minify:false,
    legalComments:'inline'
  }).code;
  return '<script'+attrs+'>'+out+'</script>';
});

fs.writeFileSync(file,html,'utf8');

for(const jsFile of ['franquias-admin.js']){
  if(!fs.existsSync(jsFile)) continue;
  const src=fs.readFileSync(jsFile,'utf8');
  const out=transformSync(src,{
    loader:'js',
    target:['chrome70','edge79'],
    format:'default',
    minify:false,
    legalComments:'inline'
  }).code;
  fs.writeFileSync(jsFile,out,'utf8');
}

console.log('legacy transpile concluido');

// trigger legacy transpile
