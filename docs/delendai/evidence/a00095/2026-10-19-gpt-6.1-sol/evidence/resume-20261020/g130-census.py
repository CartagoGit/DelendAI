import subprocess,collections,re,json,yaml
SNAPSHOT="a750c67d8d9fefb09ae3acb890826081492539eb"
rows=[]
def walk(value,path):
 if isinstance(value,dict):
  for key,child in value.items():
   if key=="uses" and isinstance(child,str) and not child.startswith(("./","docker://")):
    rows.append({"file":path,"uses":child})
   walk(child,path)
 elif isinstance(value,list):
  for child in value:walk(child,path)
for path in subprocess.check_output(["git","ls-tree","-r","--name-only",SNAPSHOT,".github/workflows"],text=True).splitlines():
 if path.endswith((".yml",".yaml")):
  walk(yaml.safe_load(subprocess.check_output(["git","show",SNAPSHOT+":"+path],text=True)),path)
print(json.dumps({"snapshot":SNAPSHOT,"totalExternalUses":len(rows),"workflowFiles":len({r["file"] for r in rows}),"pinnedSha":sum(bool(re.search(r"@[0-9a-fA-F]{40}$",r["uses"])) for r in rows),"counts":dict(collections.Counter(r["uses"] for r in rows)),"uses":rows},indent=2))
