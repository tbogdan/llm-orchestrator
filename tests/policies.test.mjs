import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFileSync(root+p,'utf8');
test('standalone core has no application paths or unconditional persistence product',()=>{
 for(const path of ['SKILL.md','protocol.md',...readdirSync(root+'policies').map(x=>'policies/'+x),...readdirSync(root+'workflows').map(x=>'workflows/'+x)]) {
  const text=read(path);
  assert.doesNotMatch(text,/PhpstormProjects|\/Users\/|events_backend|events_app|Events|Oameni/,path);
  assert.doesNotMatch(text,/mempalace.*mandatory on every|dispatch all 6|launch one fresh session with.*permission/i,path);
 }
});
test('core keeps refusal fallback, independence, truthful evidence and separate cleanup',()=>{
 assert.match(read('policies/capabilities.md'),/explicit user refusal/);
 assert.match(read('policies/dispatch.md'),/does not inherit/);
 assert.match(read('policies/verification.md'),/unverified separately/);
 assert.match(read('policies/cleanup.md'),/Verification and cleanup are separate/);
});
