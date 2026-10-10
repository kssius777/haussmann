"""Builds public/data/cards.json: one compact row per building, used to seed the database."""
import json, glob, os, sys
src = sys.argv[1]  # folder holding index.json and a/*.json
ix = json.load(open(os.path.join(src, 'index.json')))
F = ix['fields']
rows = []
for i, a in enumerate(ix['arr']):
    d = json.load(open(os.path.join(src, 'a', a['c'] + '.json')))
    for k, row in enumerate(d['cards']):
        c = dict(zip(F, row))
        et = max(1, c['et'] or round((c['h'] or 12) / 3)) if c['lk'] == 'l' else 1
        rows.append([i * 100000 + k, a['n'], c['r'], c['lk'], c['lots'], et, c['v'], c['rent'], 1 if c['pk'] else 0,
                     (c['name'] or c['adr'] or '')[:120]])
json.dump(rows, open(sys.argv[2], 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(rows), 'cards')
