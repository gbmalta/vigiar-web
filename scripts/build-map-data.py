"""Derive public, municipality-level map assets from the verified GCS release.
No person-level records or credentials are copied to the website.
"""
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timezone
import argparse, base64, gzip, hashlib, json, math, shutil, urllib.request
import pandas as pd
import pyarrow.parquet as pq
from shapely import from_wkb, make_valid
from shapely.geometry import shape, mapping

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--reference-dir', type=Path, required=True)
parser.add_argument('--raw-dir', type=Path, required=True)
parser.add_argument('--output', type=Path)
parser.add_argument('--release-dir', type=Path, required=True)
parser.add_argument('--reports-dir', type=Path)
args = parser.parse_args()
HERE = args.reference_dir.resolve()
HERE.mkdir(parents=True, exist_ok=True)
RAW = args.raw_dir
OUT = args.output or Path(__file__).resolve().parents[1] / 'public' / 'data'
OUT.mkdir(parents=True, exist_ok=True)
YEARS = list(range(2021, 2027))
STUDY = ['3304557','4314902','1302603','2611606','5103403']

def write(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')

def fetch(url, filename):
    dest = HERE / filename
    if not dest.exists():
        with urllib.request.urlopen(url, timeout=120) as r:
            b = r.read()
        if b[:2] == b'\x1f\x8b': b = gzip.decompress(b)
        dest.write_bytes(b)
    return json.loads(dest.read_bytes())

release_dir = args.release_dir
manifest = json.loads((release_dir / 'manifest.json').read_text('utf-8'))
verified = []
for obj in manifest['objects']:
    if not obj['name'].endswith('.parquet'): continue
    p = RAW / Path(obj['name']).name
    h = base64.b64encode(hashlib.md5(p.read_bytes()).digest()).decode()
    assert h == obj['md5Hash'] and p.stat().st_size == int(obj['size']), p
    verified.append(p.name)
assert len(verified) == 18
print('Verified all 18 source hashes.', flush=True)

localities = fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios', 'ibge_localities.json')
names = {}
for item in localities:
    micro = item.get('microrregiao')
    uf = micro['mesorregiao']['UF']['sigla'] if micro else item['regiao-imediata']['regiao-intermediaria']['UF']['sigla']
    names[str(item['id'])] = (item['nome'], uf)
polygons = fetch('https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=municipio&qualidade=minima&formato=application/vnd.geo%2Bjson', 'ibge_municipalities.geojson')
cities = []
for f in polygons['features']:
    code = f['properties']['codarea']
    geom = shape(f['geometry'])
    point = geom.representative_point()
    name, uf = names.get(code, (code, ''))
    cities.append({'id': code, 'name': name, 'uf': uf, 'lat': round(point.y,5), 'lng':round(point.x,5)})
cities.sort(key=lambda x: x['id'])
codes = {c['id'] for c in cities}
six = {c['id'][:6]:c['id'] for c in cities}
def code7(v):
    s = str(v).strip().removesuffix('.0')
    return six.get(s, s)

counts = defaultdict(lambda: defaultdict(int))
ranges = {str(y): {'min':None,'max':None} for y in YEARS}
outside = 0
for p in sorted(RAW.glob('20*_part_*.parquet')):
    for batch in pq.ParquetFile(p).iter_batches(batch_size=150000, columns=['id_municipio_notificacao','data_notificacao','qt']):
        df = batch.to_pandas(ignore_metadata=True)
        dt = pd.to_datetime(df['data_notificacao'])
        df['year'] = dt.dt.year
        df['code'] = df['id_municipio_notificacao'].map(code7)
        outside += int(df.loc[~df['year'].isin(YEARS), 'qt'].sum())
        for (y,c), n in df.groupby(['year','code'], dropna=False)['qt'].sum().items():
            if y in YEARS: counts[str(int(y))][str(c)] += int(n)
        for y in YEARS:
            v = dt[df['year'] == y]
            if v.empty: continue
            lo, hi = v.min().date().isoformat(), v.max().date().isoformat()
            r = ranges[str(y)]
            r['min'] = min(r['min'] or lo,lo); r['max'] = max(r['max'] or hi,hi)
    print('Aggregated', p.name, flush=True)
expected = [1009083,1395153,1508936,6471520,1716415,405781]
annual = {}
for y, total in zip(YEARS,expected):
    k = str(y); got = sum(counts[k].values())
    assert got == total, (y,got,total)
    mapped = {c:n for c,n in counts[k].items() if c in codes}
    annual[k] = {'total':got, 'mapped':sum(mapped.values()), 'unmapped':got-sum(mapped.values()), 'municipalities':len(mapped), **ranges[k]}
    write(f'notifications-{y}.json', mapped)
write('series.json', {c:[counts[str(y)].get(c,0) for y in YEARS] for c in codes if any(counts[str(y)].get(c,0) for y in YEARS)})

climate = pq.read_table(RAW / 'fat_clima.parquet').to_pandas(ignore_metadata=True)
climate['id_municipio'] = climate['id_municipio'].map(code7)
climate_meta = {}
tempcol='temp_media_diaria_media_semana_media_estacoes'
raincol='precip_total_semana_media_estacoes'
def num(v, n=2): return round(float(v),n) if pd.notna(v) and math.isfinite(float(v)) else None
for y in YEARS:
    frame=climate[climate['ano']==y]
    data={}
    for c,g in frame.groupby('id_municipio'):
        if c not in codes: continue
        data[c]=[num(g[tempcol].mean()),num(g[raincol].sum(min_count=1)),int(g[tempcol].count()),int(g[raincol].count()),str(g['data_fim_semana'].max())]
    write(f'climate-{y}.json', data)
    climate_meta[str(y)]={'municipalities':len(data),'min':str(frame['data_inicio_semana'].min()),'max':str(frame['data_fim_semana'].max()),'weeks':int(frame['semana'].nunique())}

cnes = pq.read_table(RAW / 'dim_cnes.parquet', columns=['id_municipio_gestor','id_cnes']).to_pandas(ignore_metadata=True)
cnes['code']=cnes['id_municipio_gestor'].map(code7)
cnes_counts={str(c):int(n) for c,n in cnes.groupby('code').size().items() if c in codes}
write('cnes.json', cnes_counts)

udh = pq.read_table(RAW / 'dim_udh.parquet').to_pandas(ignore_metadata=True)
avs = pq.read_table(RAW / 'fat_avs.parquet', columns=['udh','ivs','idhm','renda_per_capita']).to_pandas(ignore_metadata=True)
assert not avs['udh'].duplicated().any()
avs = avs.set_index('udh')
linked = pq.read_table(RAW / 'dim_cnes_udh.parquet', columns=['id_cnes','no_fantasia','id_municipio','lat','long','udh']).to_pandas(ignore_metadata=True)
linked['id_municipio'] = linked['id_municipio'].map(code7)
facility_counts=linked.groupby('udh').size().to_dict()
udh_counts={}
geometry_repairs=[]
for c in STUDY:
    features=[]
    for row in udh[udh['id_municipio']==c].itertuples():
        a=avs.loc[row.id_udh] if row.id_udh in avs.index else None
        props={'id':row.id_udh,'name':row.nome_udh,'city':c,'ivs':num(a['ivs'],3) if a is not None else None,'idhm':num(a['idhm'],3) if a is not None else None,'income':num(a['renda_per_capita']) if a is not None else None,'cnes':int(facility_counts.get(row.id_udh,0))}
        original=from_wkb(row.geometry)
        if not original.is_valid:
            original=make_valid(original,method='structure',keep_collapsed=False)
            geometry_repairs.append(row.id_udh)
        simplified=original.simplify(0.00015,preserve_topology=True)
        if not simplified.is_valid:
            simplified=make_valid(simplified,method='structure',keep_collapsed=False)
        assert simplified.is_valid and not simplified.is_empty
        assert simplified.geom_type in ('Polygon','MultiPolygon')
        geo=mapping(simplified)
        features.append({'type':'Feature','properties':props,'geometry':geo})
    write(f'udh-{c}.geojson', {'type':'FeatureCollection','features':features})
    udh_counts[c]=len(features)
    # Only institution identifiers and names; no contacts, CPF or person fields.
    facilities=[]
    for row in linked[linked['id_municipio']==c].itertuples():
        lat,lng=num(row.lat,5),num(row.long,5)
        if lat is not None and lng is not None and -34 <= lat <= 6 and -74 <= lng <= -28:
            facilities.append([str(row.id_cnes),str(row.no_fantasia),lat,lng,str(row.udh)])
    write(f'facilities-{c}.json',facilities)

meta={'builtAt':datetime.now(timezone.utc).isoformat(),'runId':manifest['run_id'],'sourcePrefix':manifest['prefix'],'years':YEARS,'annual':annual,'climate':climate_meta,'study':STUDY,'udhCounts':udh_counts,'cnes':{'reference':'2026-07','total':len(cnes),'mapped':sum(cnes_counts.values()),'linked':len(linked)},'udhReference':2010,'outsideYears':outside,'verifiedFiles':len(verified),'geography':{'source':'IBGE – API de malhas simplificadas','url':'https://servicodados.ibge.gov.br/api/docs/malhas?versao=3','municipalities':len(cities),'location':'Ponto representativo interno ao polígono do município; não é endereço de residência ou de atendimento.'}}
write('municipalities.json', cities)
write('metadata.json', meta)
report_dir=OUT.parent / 'reports'
report_dir.mkdir(exist_ok=True)
if args.reports_dir:
    for f in args.reports_dir.glob('VIGIAR_*_20260909.pdf'):
        shutil.copy2(f,report_dir/f.name)
evidence={'sourceHashesVerified':verified,'geometryRepairsForDisplayOnly':geometry_repairs,'annual':annual,'climate':climate_meta,'cnes':meta['cnes'],'udhCounts':udh_counts,'assets':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in OUT.iterdir() if p.is_file()}}
(HERE/'map_validation.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'annual':annual,'climate':climate_meta,'bytes':sum(p.stat().st_size for p in OUT.iterdir()),'output':str(OUT)},ensure_ascii=False),flush=True)
