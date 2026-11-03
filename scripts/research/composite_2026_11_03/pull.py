import json,os,sys,urllib.request
U=os.environ['EXPO_PUBLIC_SUPABASE_URL'];K=os.environ['EXPO_PUBLIC_SUPABASE_ANON_KEY']
def get(path):
    r=urllib.request.Request(U+path,headers={'apikey':K,'Authorization':'Bearer '+K})
    return json.load(urllib.request.urlopen(r,timeout=60))
rows=[];off=0
while True:
    b=get(f"/rest/v1/histories?select=id,jurisdiction,result_digits,comboset_sorted,session,date_et&date_et=gte.2026-04-01&jurisdiction=not.is.null&order=date_et.asc,id.asc&limit=1000&offset={off}")
    rows+=b; off+=1000
    if len(b)<1000: break
json.dump(rows,open(sys.argv[1],'w'))
from collections import Counter
print(len(rows),'rows', Counter(r['session'] for r in rows), 'max date', max(r['date_et'] for r in rows), 'ids unique', len({r['id'] for r in rows}))
