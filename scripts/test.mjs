import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('.test-output',{recursive:true});
await build({entryPoints:['tests/scraper.test.ts'],bundle:true,packages:'external',platform:'node',format:'esm',outfile:'.test-output/scraper.test.mjs'});
const result=spawnSync(process.execPath,['--test','.test-output/scraper.test.mjs'],{stdio:'inherit'});
process.exit(result.status??1);
