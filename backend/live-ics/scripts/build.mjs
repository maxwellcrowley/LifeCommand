import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json'],{stdio:'inherit'});
if(result.status!==0) process.exit(result.status??1);
writeFileSync('.build/package.json','{"type":"commonjs"}');
