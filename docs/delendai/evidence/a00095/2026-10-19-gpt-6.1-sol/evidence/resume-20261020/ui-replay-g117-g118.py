import subprocess,json
s='a750c67d8d9fefb09ae3acb890826081492539eb'
get=lambda p:subprocess.check_output(['git','show',s+':'+p],text=True)
patterns=get('packages/core/src/lib/contracts/constants/secret-patterns.constant.ts')
redact=get('packages/core/src/lib/shared/redact.ts');redact=redact[redact.index('export interface IRedactResult'):]
memory=get('plugins/memory/src/lib/services/store-records.ts')
kebab=memory[memory.index('const kebab'):memory.index('/**',memory.index('const kebab'))]
derive=memory[memory.index('export const deriveNoteId'):memory.index('/**',memory.index('export const deriveNoteId'))]
script='const patterns='+json.dumps(patterns)+';const redactor='+json.dumps(redact)+';const ids='+json.dumps(kebab+derive)+';\n'+r"""const t=new Bun.Transpiler({loader:'ts'});const code=(v)=>t.transformSync(v).replace(/export /g,'');const redact=new Function(code(patterns)+'\n'+code(redactor)+'\nreturn redactSecrets')();
const rows=[['project_key','sk-'+'proj-'+'a'.repeat(56)],['npm','npm_'+'a'.repeat(36)],['redis','redis://:syntheticpass@cache:6379/0'],['mongodb','mongodb+srv://user:syntheticpass@cluster.invalid/db'],['postgres','DATABASE_URL=postgres://user:syntheticpass@host.invalid/db'],['snake','db_password = syntheticpass123'],['api_snake','my_api_key=syntheticpass123'],['control','password=syntheticpass123']];for(const [label,value] of rows){const r=redact(value);console.log(JSON.stringify({label,redactions:r.redactions,unchanged:r.text===value}));}
const derive=new Function(code(ids)+'\nreturn deriveNoteId')();const original=Date.now;Date.now=()=>1000;const a=derive('日本語のメモ');Date.now=()=>1001;const b=derive('日本語のメモ');Date.now=original;console.log(JSON.stringify({collision:derive('release/v1')===derive('release-v1'),cjkStable:a===b}));
console.log(JSON.stringify({url:new URL('/repos/../orgs/acme/releases/1','https://api.github.com/').pathname}));"""
r=subprocess.run(['bun','run','-'],input=script,text=True,capture_output=True)
print('EXEC exit',r.returncode);print(r.stdout,r.stderr)
