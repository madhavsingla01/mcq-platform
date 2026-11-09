// Source-only evidence. Never reads .env, uploads, node_modules or database data.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
async function walk(dir) {
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const name=path.join(dir,entry.name);
    if(entry.isDirectory()) result.push(...await walk(name));
    else if(/\.(js|jsx|ts|tsx)$/.test(name)) result.push(name);
  }
  return result;
}
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const services=[];
for(const service of (await readdir(path.join(root,'services'),{withFileTypes:true})).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
  const source=path.join(root,'services',service.name,'src');
  const files=await walk(source);
  const models=[];const operations=[];const mounts=[];const network=[];const schedules=[];
  for(const file of files) {
    const text=await readFile(file,'utf8');const lines=text.split(/\r?\n/);
    if(file.includes(`${path.sep}models${path.sep}`)) models.push(relative(file));
    const aliases=[...text.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]*models\/[^'"]+)['"]/g)].map(m=>[m[1],m[2].split('/').at(-1)]);
    for(let index=0;index<lines.length;index++) {
      const line=lines[index];const evidence={file:relative(file),line:index+1};
      for(const [alias,model] of aliases) {
        const method=line.match(new RegExp(`\\b${alias}\\.(find\\w*|count\\w*|aggregate|distinct|create|insertMany|update\\w*|delete\\w*|bulkWrite)\\s*\\(`));
        if(method) operations.push({...evidence,model,operation:method[1],kind:/create|insert|update|delete|bulkWrite/i.test(method[1])?'write':'read'});
        if(new RegExp(`new ${alias}\\s*\\(`).test(line)) operations.push({...evidence,model,operation:'new document (save must be verified)',kind:'write-candidate'});
      }
      if(/app\.use\(|router\.(get|post|put|patch|delete)\(/.test(line)) mounts.push({...evidence,registration:line.trim()});
      if(/fetch\(|SERVICE_URL|createProxyMiddleware\(/.test(line)) network.push({...evidence,reference:line.trim()});
      if(/cron\.schedule\(|setInterval\(|start.*Worker\(/.test(line)) schedules.push({...evidence,reference:line.trim()});
    }
  }
  services.push({name:service.name,sourceFiles:files.length,models,operations,mounts,network,schedules});
}
const result={schemaVersion:1,scope:'Source evidence only. Operation detection is a lower bound, not runtime reachability or complete field-level ownership. Document saves, raw Mongo collections and dynamic repositories require manual review.',services};
await writeFile(path.join(root,'docs/enterprise-upgrade/architecture-inventory.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(services.map(s=>({service:s.name,sourceFiles:s.sourceFiles,models:s.models.length,operations:s.operations.length,mounts:s.mounts.length,network:s.network.length})),null,2));
