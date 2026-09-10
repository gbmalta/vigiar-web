"""Validate map aggregates, geometry and the published column allowlist."""
import json
from pathlib import Path
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'
read = lambda name: json.loads((DATA / name).read_text('utf-8'))
meta = read('metadata.json')
cities = read('municipalities.json')
codes = {c['id'] for c in cities}
series = read('series.json')
assert len(codes) == 5570
assert all(set(c) == {'id','name','uf','lat','lng'} for c in cities)
assert all(-34 <= c['lat'] <= 6 and -74 <= c['lng'] <= -28 for c in cities)
total = facilities = udhs = 0
checks = []
for year in meta['years']:
    data = read(f'notifications-{year}.json')
    assert set(data) <= codes
    assert sum(data.values()) == meta['annual'][str(year)]['mapped']
    assert all(type(v) == int and v > 0 for v in data.values())
    assert all(series[c][year-2021] == value for c,value in data.items())
    total += meta['annual'][str(year)]['total']
    weather = read(f'climate-{year}.json')
    assert set(weather) <= codes
    assert all(len(v) == 5 and v[2] >= 0 and v[3] >= 0 for v in weather.values())
    checks.append(f'{year}: annual totals and municipal time series reconciled')
for city in meta['study']:
    geo = read(f'udh-{city}.geojson')
    units = read(f'facilities-{city}.json')
    assert len(geo['features']) == meta['udhCounts'][city]
    assert sum(f['properties']['cnes'] for f in geo['features']) == len(units)
    assert all(shape(f['geometry']).is_valid for f in geo['features'])
    assert all(set(f['properties']) == {'id','name','city','ivs','idhm','income','cnes'} for f in geo['features'])
    assert all(len(f) == 5 and -34 <= f[2] <= 6 and -74 <= f[3] <= -28 for f in units)
    facilities += len(units)
    udhs += len(geo['features'])
assert (total,facilities,udhs) == (12506888,39980,1961)
assert len(list((ROOT/'public/reports').glob('*.pdf'))) == 2
checks += ['All 1961 display geometries valid','39980 facility coordinates reconcile to UDH totals','5570 representative municipal points within Brazil bounds','Distributed column allowlist excludes patient records and contacts','Two report PDFs present']
result = {'passed':True,'checks':checks,'notifications':total,'mapped':total-18,'unmapped':{'municipality':'5101837','name':'Boa Esperança do Norte','notifications2026':18,'reason':'Current IBGE simplified mesh omits this municipality; direct municipality request returned HTTP 500'},'initialDataBytes':sum((DATA/f).stat().st_size for f in ['metadata.json','municipalities.json','series.json','notifications-2026.json']),'allDataAssetsBytes':sum(p.stat().st_size for p in DATA.iterdir())}
(ROOT/'docs/data-checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
