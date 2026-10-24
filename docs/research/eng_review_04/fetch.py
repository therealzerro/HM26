import os, json, sys, urllib.request, urllib.parse
URL=os.environ['EXPO_PUBLIC_SUPABASE_URL']; KEY=os.environ['EXPO_PUBLIC_SUPABASE_ANON_KEY']
rows=[]; off=0
while True:
    q=f"{URL}/rest/v1/histories?date_et=gte.2026-04-01&date_et=lte.2026-10-23&select=date_et,session,jurisdiction,game,result_digits&order=date_et.asc,jurisdiction.asc,result_digits.asc&limit=1000&offset={off}"
    req=urllib.request.Request(q,headers={'apikey':KEY,'Authorization':f'Bearer {KEY}'})
    page=json.load(urllib.request.urlopen(req,timeout=60))
    rows+=page; print(off,len(page),file=sys.stderr)
    if len(page)<1000: break
    off+=1000
json.dump(rows,open(sys.argv[1],'w'))
print(len(rows))
