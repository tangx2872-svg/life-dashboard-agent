import {readdir,readFile,mkdir,cp} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
let checked=0;
for(const folder of ['public','server','scripts','tests'])for(const file of await readdir(new URL(folder+'/',root))){
 if(!/\.(?:m?js|cjs)$/.test(file))continue;
 const path=fileURLToPath(new URL(folder+'/'+file,root));const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);checked++;
}
const files=await readdir(new URL('public/',root));const html=await readFile(new URL('public/index.html',root),'utf8');
for(const match of html.matchAll(/(?:src|href)="([\w.-]+\.(?:js|css))"/g))if(!files.includes(match[1]))throw Error('Missing asset: '+match[1]);
if(process.argv.includes('--build')){await mkdir(new URL('.local/build/public/',root),{recursive:true});await cp(new URL('public/',root),new URL('.local/build/public/',root),{recursive:true});console.log('Static frontend built to .local/build/public (no credentials or database files).')}
console.log(`PASS: ${checked} JavaScript syntax checks and entry asset references. No framework compilation required.`);
