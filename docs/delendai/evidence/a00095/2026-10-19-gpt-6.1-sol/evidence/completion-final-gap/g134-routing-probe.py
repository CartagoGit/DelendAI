import json
base='/delendai'
languages=['en','es','fr','de','pt','it','zh','hi','ar','ja','vi','th']
def href(current,code):
 segs=[s for s in current.split('/') if s]
 relative='/'+('/'.join(segs[1:])) if segs and segs[0] in languages and segs[0]!='en' else current or '/'
 return base+relative if code=='en' else base+'/'+code+relative
rows=[{'currentPath':p,'locale':l,'href':href(p,l)} for p in ['/delendai/plugins/','/delendai/es/plugins/'] for l in ['en','ar','es']]
print(json.dumps({'method':'Pure transcription of Config.astro:25-40, not an Astro build or browser run','rows':rows},indent=2))
