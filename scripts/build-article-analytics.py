"""Regenerate ONLY public aggregates from the 18 verified private Gold Parquets.

Usage: python scripts/build-article-analytics.py --raw-dir ... --release-dir ...
Raw records, personal identifiers and the unpublished manuscript never leave the input directory.
"""
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime, timezone
import argparse
import base64
import hashlib
import json
import math
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from analytics_core import (week_start, future_burden, split_masks, fit_targets, fit_bins,
                            counts_for, from_counts, psi, cluster_interval, weighted_quantile_hist, SEED)

ROOT = Path(__file__).resolve().parents[1]
CITIES = {'3304557': 'Rio de Janeiro', '4314902': 'Porto Alegre', '1302603': 'Manaus',
          '2611606': 'Recife', '5103403': 'Cuiabá'}
PAPER_SHA = 'ef35180975a0b752aefcb49a829ca6d1aa96e6064535f4dacc54d2fe9fa4c3d1'


def clean(obj):
    if isinstance(obj, dict): return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)): return [clean(v) for v in obj]
    if isinstance(obj, (np.integer,)): return int(obj)
    if isinstance(obj, (np.floating, float)):
        return round(float(obj), 8) if math.isfinite(obj) else None
    if isinstance(obj, (pd.Timestamp,)): return obj.date().isoformat()
    return obj


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-dir', type=Path, required=True)
    parser.add_argument('--release-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'public/analytics')
    args = parser.parse_args()
    raw, out = args.raw_dir, args.output
    out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((args.release_dir / 'manifest.json').read_text('utf-8'))
    sources = []
    for obj in manifest['objects']:
        if not obj['name'].endswith('.parquet'): continue
        path = raw / Path(obj['name']).name
        payload = path.read_bytes()
        assert len(payload) == int(obj['size'])
        assert base64.b64encode(hashlib.md5(payload).digest()).decode() == obj['md5Hash'], path.name
        sources.append({'file': path.name, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
    assert len(sources) == 18
    print('Verified 18 source files against the validated release.', flush=True)

    def read(name, columns=None):
        return pq.read_table(raw / (name + '.parquet'), columns=columns).to_pandas(ignore_metadata=True)

    municipalities = json.loads((ROOT / 'public/data/municipalities.json').read_text('utf-8'))
    # The public map index is the exact same IBGE reference used in the existing release.
    codes = {str(c['id']) for c in municipalities}
    six = {c[:6]: c for c in codes}
    def code7(v):
        if pd.isna(v): return None
        s = str(v).strip().removesuffix('.0')
        return six.get(s, s)

    inventory, missing = {}, defaultdict(lambda: {'nulls': 0, 'rows': 0, 'known': True})
    for source in sources:
        path = raw / source['file']
        pf = pq.ParquetFile(path)
        table = 'fat_sinan' if path.name.startswith('20') else path.stem
        item = inventory.setdefault(table, {'table': table, 'rows': 0, 'columns': len(pf.schema_arrow), 'files': 0})
        item['rows'] += pf.metadata.num_rows
        item['files'] += 1
        for i, field in enumerate(pf.schema_arrow):
            row = missing[(table, field.name)]
            row['type'] = str(field.type)
            row['rows'] += pf.metadata.num_rows
            for r in range(pf.metadata.num_row_groups):
                stats = pf.metadata.row_group(r).column(i).statistics
                if stats is None or not stats.has_null_count: row['known'] = False
                else: row['nulls'] += stats.null_count

    missing_rows = [{'table': table, 'column': column, 'type': x['type'], 'rows': x['rows'],
                     'nulls': x['nulls'] if x['known'] else None,
                     'completeness': 1 - x['nulls'] / x['rows'] if x['known'] else None}
                    for (table, column), x in missing.items()]

    cnes = read('dim_cnes', ['id_cnes', 'id_municipio_gestor', 'nu_latitude', 'nu_longitude'])
    cnes['city'] = cnes['id_municipio_gestor'].map(code7)
    cnes_ids = set(cnes['id_cnes'].dropna())
    links = read('dim_cnes_udh', ['id_cnes', 'id_municipio', 'udh', 'lat', 'long'])
    links['city'] = links['id_municipio'].map(code7)
    udh = read('dim_udh', ['id_udh', 'id_municipio'])
    avs = read('fat_avs')
    dim_mun = read('dim_municipios')
    calendar = read('dim_calendario', ['data', 'semana_epidemiologica'])
    calendar['data'] = pd.to_datetime(calendar['data'])
    climate = read('fat_clima')
    climate['city'] = climate['id_municipio'].map(code7)
    climate['week'] = pd.to_datetime(climate['data_inicio_semana'])
    climate['end'] = pd.to_datetime(climate['data_fim_semana'])
    climate['week_key'] = climate['city'] + '|' + climate['week'].dt.strftime('%Y-%m-%d')
    assert not climate.duplicated(['city', 'week']).any()
    assert not links['id_cnes'].duplicated().any()
    assert not avs['udh'].duplicated().any()
    udh_ids, avs_ids = set(udh['id_udh']), set(avs['udh'])
    linked_ids = set(links.loc[links['udh'].isin(udh_ids), 'id_cnes'])
    avs_link_ids = set(links.loc[links['udh'].isin(avs_ids), 'id_cnes'])
    linked_city = links.set_index('id_cnes')['city'].to_dict()
    climate_keys = set(climate['week_key'])
    calendar_dates = set(calendar['data'])
    calendar_weeks = calendar.set_index('data')['semana_epidemiologica']

    checks = []
    def rule(dimension, name, numerator, denominator, note, kind='pass'):
        checks.append({'dimension': dimension, 'name': name, 'numerator': int(numerator),
                       'denominator': int(denominator), 'rate': numerator / denominator if denominator else None,
                       'kind': kind, 'note': note})
    for name, frame, keys in [
        ('dim_calendario', calendar, ['data']), ('dim_cnes', cnes, ['id_cnes']),
        ('dim_cnes_udh', links, ['id_cnes']), ('dim_udh', udh, ['id_udh']),
        ('fat_avs', avs, ['ano', 'id_municipio', 'udh', 'sexo', 'raca_cor', 'localizacao']),
        ('dim_municipios', dim_mun, ['ano', 'id_municipio', 'udh', 'sexo', 'raca_cor', 'localizacao']),
        ('fat_clima', climate, ['city', 'week'])]:
        rule('Unicidade', name + ': linhas sem repetição da chave', len(frame) - frame.duplicated(keys).sum(), len(frame), 'Chave: ' + ', '.join(keys))
        # UDH is a nullable component of the municipality aggregate key; not every component is mandatory.
    rule('Integridade referencial', 'CNES–UDH → UDH', links['udh'].isin(udh_ids).sum(), links['udh'].notna().sum(), 'Linhas da ponte espacial com UDH presente e encontrada.')
    rule('Integridade referencial', 'CNES–UDH → CNES', links['id_cnes'].isin(cnes_ids).sum(), links['id_cnes'].notna().sum(), 'Mesmo snapshot CNES de julho de 2026.')
    rule('Integridade referencial', 'AVS → UDH', avs['udh'].isin(udh_ids).sum(), avs['udh'].notna().sum(), 'Indicadores socioeconômicos de 2010.')
    rule('Consistência', 'Clima: janelas de domingo a sábado', ((climate['week'].dt.dayofweek == 6) & ((climate['end'] - climate['week']).dt.days == 6)).sum(), len(climate), 'Junção por data de início; não mistura semana ISO e epidemiológica.')
    for col, label, low, high in [
        ('precip_total_semana_media_estacoes', 'Precipitação semanal ≥ 0', 0, None),
        ('umidade_rel_media_diaria_media_semana_media_estacoes', 'Umidade média entre 0 e 100%', 0, 100),
        ('vento_vel_media_diaria_media_semana_media_estacoes', 'Vento médio ≥ 0', 0, None)]:
        values = climate[col]
        valid = values.ge(low) & (values.le(high) if high is not None else True)
        rule('Plausibilidade', label, valid.sum(), values.notna().sum(), 'Testado no agregado semanal disponível; não em leituras brutas de estação.')
    lo = climate['temp_min_diaria_media_semana_media_estacoes']
    mean = climate['temp_media_diaria_media_semana_media_estacoes']
    hi = climate['temp_max_diaria_media_semana_media_estacoes']
    present = lo.notna() & mean.notna() & hi.notna()
    rule('Plausibilidade', 'Temperatura: mínima ≤ média ≤ máxima', ((lo <= mean) & (mean <= hi) & present).sum(), present.sum(), 'Comparação entre médias semanais de estações; divergências requerem inspeção da composição de estações.')

    spatial = []
    for city, name in CITIES.items():
        f = cnes[cnes['city'] == city]
        lat = pd.to_numeric(f['nu_latitude'].astype('string').str.replace(',', '.'), errors='coerce')
        lng = pd.to_numeric(f['nu_longitude'].astype('string').str.replace(',', '.'), errors='coerce')
        both = lat.notna() & lng.notna()
        bounds = both & lat.between(-34, 6) & lng.between(-74, -28)
        spatial.append({'city': city, 'name': name, 'facilities': len(f), 'coordinates': int(both.sum()),
                        'bounds': int(bounds.sum()), 'linked': int((links['city'] == city).sum()),
                        'udh': int((udh['id_municipio'] == city).sum())})

    daily = defaultdict(Counter)
    facility_week = Counter()
    totals = Counter()
    annual = Counter()
    scopes = defaultdict(Counter)
    delay_hist = defaultdict(Counter)
    close_hist = defaultdict(Counter)
    funnel_weeks = defaultdict(Counter)
    min_date, max_date = None, None
    selected = ['data_notificacao', 'id_municipio_notificacao', 'id_cnes', 'data_primeiros_sintomas',
                'semana_sintomas', 'data_nascimento_paciente', 'data_investigacao', 'qt',
                'qt_dias_notificacao_primeiros_sintomas', 'qt_dias_encerramento', 'flag_caso_encerrado']
    for source in sources:
        if not source['file'].startswith('20'): continue
        for batch in pq.ParquetFile(raw / source['file']).iter_batches(batch_size=150000, columns=selected):
            df = batch.to_pandas(ignore_metadata=True)
            dt = pd.to_datetime(df['data_notificacao'])
            onset = pd.to_datetime(df['data_primeiros_sintomas'])
            birth = pd.to_datetime(df['data_nascimento_paciente'])
            investigation = pd.to_datetime(df['data_investigacao'])
            city = df['id_municipio_notificacao'].map(code7)
            w = df['qt'].astype('int64')
            assert w.gt(0).all()
            valid_date = dt.between('2021-01-01', '2026-12-31')
            known_city = city.isin(codes)
            present_cnes = df['id_cnes'].notna() & df['id_cnes'].ne('')
            matched_cnes = df['id_cnes'].isin(cnes_ids)
            wk = week_start(dt)
            delay = (dt - onset).dt.days
            legacy = df['qt_dias_notificacao_primeiros_sintomas']
            # Source closure duration starts at symptoms, or notification if symptoms missing.
            reconstructed_close = df['qt_dias_encerramento'] - delay.fillna(0)
            both_delay = delay.notna() & legacy.notna()
            source_epi = pd.to_numeric(df['semana_sintomas'].str.split('-').str[-1], errors='coerce')
            expected_epi = onset.map(calendar_weeks)
            comparable_epi = expected_epi.notna() & source_epi.notna()
            masks = {
                'date_present': dt.notna(), 'date_valid': valid_date, 'city_present': city.notna(),
                'city_match': known_city, 'cnes_present': present_cnes, 'cnes_match': matched_cnes,
                'calendar_present': dt.notna(), 'calendar_match': dt.isin(calendar_dates),
                'onset_present': onset.notna(), 'delay_negative': delay.lt(0),
                'delay_present': delay.notna(), 'closed': df['flag_caso_encerrado'].eq(1),
                'closure_present': reconstructed_close.notna(), 'closure_negative': reconstructed_close.lt(0),
                'legacy_comparable': both_delay, 'legacy_reversed': both_delay & legacy.eq(-delay),
                'legacy_disagrees': both_delay & legacy.ne(delay),
                'birth_present': birth.notna() & dt.notna(), 'birth_after': birth.gt(dt),
                'investigation_present': investigation.notna() & dt.notna(), 'investigation_before': investigation.lt(dt),
                'epi_comparable': comparable_epi, 'epi_match': comparable_epi & source_epi.eq(expected_epi),
                'cnes_udh': df['id_cnes'].isin(linked_ids),
            }
            totals['rows'] += len(df)
            totals['notifications'] += int(w.sum())
            for key, mask in masks.items(): totals[key] += int(w[mask].sum())
            for year, count in w.groupby(dt.dt.year).sum().items(): annual[int(year)] += int(count)
            if dt.notna().any():
                low, high = dt.min(), dt.max()
                min_date = min(min_date, low) if min_date is not None else low
                max_date = max(max_date, high) if max_date is not None else high
            scope_masks = {'Brasil': pd.Series(True, index=df.index)}
            scope_masks.update({str(y): dt.dt.year.eq(y) for y in range(2021, 2027)})
            scope_masks.update({c: city.eq(c) for c in CITIES})
            for scope, mask in scope_masks.items():
                scopes[scope]['total'] += int(w[mask].sum())
                for key in ['delay_present', 'delay_negative', 'closed', 'closure_present', 'closure_negative', 'epi_comparable', 'epi_match']:
                    scopes[scope][key] += int(w[mask & masks[key]].sum())
                for value, count in w[mask & delay.ge(0)].groupby(delay).sum().items(): delay_hist[scope][int(value)] += int(count)
                for value, count in w[mask & reconstructed_close.ge(0)].groupby(reconstructed_close).sum().items(): close_hist[scope][int(value)] += int(count)
            pilot = city.isin(CITIES)
            valid_pilot = pilot & valid_date
            p = pd.DataFrame({'city': city[valid_pilot], 'date': dt[valid_pilot], 'week': wk[valid_pilot],
                              'id': df.loc[valid_pilot, 'id_cnes'], 'n': w[valid_pilot]})
            for (c, day), count in p.groupby(['city', 'date'])['n'].sum().items(): daily[c][day] += int(count)
            for (c, week, facility), count in p.groupby(['city', 'week', 'id'])['n'].sum().items():
                facility_week[(c, week, facility)] += int(count)
            spatial_same_city = df['id_cnes'].map(linked_city).eq(city) & df['id_cnes'].isin(linked_ids)
            step = pilot.copy()
            stages = [pd.Series(True, index=df.index), valid_date, known_city, matched_cnes,
                      spatial_same_city, df['id_cnes'].isin(avs_link_ids),
                      (city.astype('string') + '|' + wk.dt.strftime('%Y-%m-%d')).isin(climate_keys)]
            for i, mask in enumerate(stages):
                step &= mask
                totals[f'funnel_{i}'] += int(w[step].sum())
            for (c, week), count in w[step].groupby([city[step], wk[step]]).sum().items():
                funnel_weeks[c][week] += int(count)
        print('Aggregated dates, joins and weekly history:', source['file'], flush=True)

    old_metadata = json.loads((ROOT / 'public/data/metadata.json').read_text('utf-8'))
    for year, count in annual.items(): assert count == old_metadata['annual'][str(year)]['total']
    assert totals['notifications'] == 12506888
    n = totals['notifications']
    for label, key, denom in [('Município → IBGE', 'city_match', 'city_present'),
                              ('SINAN → CNES atual', 'cnes_match', 'cnes_present'),
                              ('SINAN → calendário', 'calendar_match', 'calendar_present')]:
        rule('Integridade referencial', label, totals[key], totals[denom], 'Ponderado por qt; denominador: notificações com chave não nula. CNES é retrospectivo (07/2026).')
    rule('Completude', 'CNES informado nas notificações', totals['cnes_present'], n, 'Presença não implica correspondência no cadastro.')
    rule('Conformidade', 'Data de notificação no intervalo da carga', totals['date_valid'], n, 'Coluna tipada date32 no Gold; máscara textual original indisponível.')
    rule('Plausibilidade', 'Sintomas não posteriores à notificação', totals['delay_present'] - totals['delay_negative'], totals['delay_present'], 'Atraso = data_notificacao − data_primeiros_sintomas; exclui ausentes do denominador.')
    rule('Plausibilidade', 'Nascimento não posterior à notificação', totals['birth_present'] - totals['birth_after'], totals['birth_present'], 'Somente pares de datas presentes; não publica datas individuais.')
    rule('Plausibilidade', 'Investigação não anterior à notificação', totals['investigation_present'] - totals['investigation_before'], totals['investigation_present'], 'Critério de sinalização para revisão, não exclusão automática dos registros.')
    rule('Consistência', 'Semana dos sintomas coincide com calendário', totals['epi_match'], totals['epi_comparable'], 'Compara número da semana na dimensão a partir da data dos sintomas; não testa ano epidemiológico nem casos fora do calendário. Divergências se concentram em 2026; revisar a convenção de semana da dimensão (ISO após deslocamento de um dia). O painel usa datas de domingo, não esse número.')
    rule('Consistência', 'Campo legado de atraso coincide com intervalo corrigido', totals['legacy_comparable'] - totals['legacy_disagrees'], totals['legacy_comparable'], 'O código de origem calcula sintomas − notificação. Este painel usa a diferença inversa, recalculada das datas.')

    timeliness = []
    for scope, counts in scopes.items():
        item = {'scope': scope, 'name': CITIES.get(scope, scope), **counts,
                'open': counts['total'] - counts['closed']}
        for label, histogram in [('notification', delay_hist[scope]), ('closure', close_hist[scope])]:
            q = weighted_quantile_hist(histogram)
            edges = [(0, 0), (1, 1), (2, 3), (4, 7), (8, 14), (15, 30), (31, 60), (61, 90), (91, None)]
            item[label] = {'q25': q[0], 'median': q[1], 'q75': q[2], 'p90': q[3], 'p95': q[4],
                           'valid': sum(histogram.values()), 'max': max(histogram) if histogram else None,
                           'histogram': [{'label': f'{lo}+' if hi is None else str(lo) if lo == hi else f'{lo}–{hi}',
                                          'n': sum(v for k, v in histogram.items() if k >= lo and (hi is None or k <= hi))} for lo, hi in edges]}
        timeliness.append(item)

    last_saturday = max_date - pd.Timedelta(days=(max_date.dayofweek - 5) % 7)
    first_sunday = min_date + pd.Timedelta(days=(6 - min_date.dayofweek) % 7)
    last_sunday = last_saturday - pd.Timedelta(days=6)
    weeks = pd.date_range(first_sunday, last_sunday, freq='W-SUN')
    frames = []
    facility_groups = defaultdict(list)
    for (city, week, _), count in facility_week.items(): facility_groups[(city, week)].append(count)
    for city in CITIES:
        daily_series = pd.Series(daily[city]).sort_index()
        counts = daily_series.resample('W-SUN', label='left', closed='left').sum().reindex(weeks, fill_value=0)
        frame = pd.DataFrame({'city': city, 'week': weeks, 'notifications': counts.values.astype(int)})
        frame['burden'] = future_burden(frame['notifications'])
        for key in ['reporters', 'reporter_hhi', 'reporter_top_share', 'reporter_coverage']:
            frame[key] = np.nan
        for i, row in frame.iterrows():
            vals = np.array(facility_groups.get((city, row['week']), []), dtype=float)
            frame.loc[i, 'reporters'] = len(vals)
            if vals.sum():
                frame.loc[i, 'reporter_hhi'] = ((vals / vals.sum()) ** 2).sum()
                frame.loc[i, 'reporter_top_share'] = vals.max() / vals.sum()
            if row['notifications']:
                frame.loc[i, 'reporter_coverage'] = vals.sum() / row['notifications']
        frames.append(frame)
    panel = pd.concat(frames, ignore_index=True)
    climate_columns = {'rain': 'precip_total_semana_media_estacoes',
                       'temperature': 'temp_media_diaria_media_semana_media_estacoes',
                       'humidity': 'umidade_rel_media_diaria_media_semana_media_estacoes',
                       'wind': 'vento_vel_media_diaria_media_semana_media_estacoes'}
    clim = climate[['city', 'week', 'end', *climate_columns.values()]].rename(columns={v: k for k, v in climate_columns.items()})
    assert (clim['end'] <= clim['week'] + pd.Timedelta(days=6)).all()
    panel = panel.merge(clim, on=['city', 'week'], how='left', validate='one_to_one')
    features = []
    def feature(key, name, block, description, unit='notificações', caveat=None):
        features.append({'id': key, 'name': name, 'block': block, 'description': description, 'unit': unit, 'caveat': caveat})
    feature('notifications', 'Notificações na semana de origem', 'Histórico', 'Soma de qt por município de notificação, no domingo–sábado t. Origem da análise: encerramento dessa semana.')
    groups = panel.groupby('city', sort=False)
    for lag in [1, 2, 4, 8, 13, 52]:
        key = f'lag_{lag}'
        panel[key] = groups['notifications'].shift(lag)
        feature(key, f'Notificações: defasagem de {lag} semana(s)', 'Histórico', f'Notificações em t−{lag}; ausente antes do início do histórico.')
    for window in [4, 8]:
        for agg, label in [('mean', 'média'), ('sum', 'soma'), ('std', 'desvio padrão'), ('max', 'máximo')]:
            key = f'rolling_{window}_{agg}'
            panel[key] = groups['notifications'].transform(lambda s: getattr(s.rolling(window, min_periods=window), agg)())
            feature(key, f'{label.capitalize()} nas últimas {window} semanas', 'Histórico', f'Janela t−{window-1} a t, incluindo a origem; desvio amostral (ddof=1) quando aplicável.')
    panel['change_1'] = panel['notifications'] - panel['lag_1']
    panel['growth_1'] = panel['change_1'] / (panel['lag_1'] + 1)
    panel['acceleration'] = panel['notifications'] - 2 * panel['lag_1'] + panel['lag_2']
    panel['change_4'] = (panel['notifications'] - panel['lag_4']) / 4
    panel['seasonal_difference'] = panel['notifications'] - panel['lag_52']
    for key, label, desc, unit in [
        ('change_1', 'Variação semanal', 'y(t) − y(t−1).', 'notificações'),
        ('growth_1', 'Crescimento semanal regularizado', '[y(t) − y(t−1)] / [y(t−1) + 1]. Denominador acrescido de uma notificação.', 'razão'),
        ('acceleration', 'Aceleração semanal', 'y(t) − 2·y(t−1) + y(t−2).', 'notificações'),
        ('change_4', 'Inclinação em quatro semanas', '[y(t) − y(t−4)] / 4. Diferença entre extremos, não regressão.', 'notificações/semana'),
        ('seasonal_difference', 'Diferença ante 52 semanas', 'y(t) − y(t−52). Aproximação de um ano; não alinhamento exato de semana epidemiológica.', 'notificações')]:
        feature(key, label, 'Dinâmica', desc, unit)
    for key, name, unit in [('rain', 'Chuva', 'mm/semana'), ('temperature', 'Temperatura', '°C'), ('humidity', 'Umidade', '%'), ('wind', 'Vento', 'm/s')]:
        feature(key, name + ' na semana de origem', 'Clima', 'Agregado semanal por município, alinhado pelo início da semana. ' + climate_columns[key] + '.', unit, 'Sem registros municipais de clima para Manaus e Recife nesta carga. Ausência mantida; nenhuma imputação espacial.')
        panel[key + '_lag4'] = panel.groupby('city')[key].shift(4)
        feature(key + '_lag4', name + ': defasagem de quatro semanas', 'Clima', 'Valor observado em t−4, sem preenchimento de lacunas.', unit)
        panel[key + '_mean4'] = panel.groupby('city')[key].transform(lambda s: s.rolling(4, min_periods=4).mean())
        feature(key + '_mean4', name + ': média de quatro semanas', 'Clima', 'Média t−3 a t; requer os quatro valores presentes.', unit)
    for key, name, desc, unit in [
        ('reporters', 'CNES notificantes ativos', 'Quantidade de IDs CNES distintos não nulos nas notificações da semana. Não usa o cadastro de 2026.', 'estabelecimentos'),
        ('reporter_hhi', 'Concentração entre notificantes (HHI)', 'Soma dos quadrados das frações de notificações por ID CNES presente, na semana t. Proxy da concentração do reporte.', '0–1'),
        ('reporter_top_share', 'Participação do maior notificante', 'Maior participação entre notificações com ID CNES presente, na semana t.', '0–1')]:
        feature(key, name, 'Rede notificante', desc, unit, 'Mede atividade de notificação, não capacidade assistencial nem distribuição de UDHs. IDs ausentes excluídos das participações.')
    for col, name in [('ivs', 'IVS'), ('idhm', 'IDHM'), ('renda_per_capita', 'Renda per capita'), ('proporcao_sem_agua_esgoto', 'Sem água/esgoto adequados')]:
        for agg, label in [('mean', 'média'), ('iqr', 'intervalo interquartil')]:
            key = f'avs_{col}_{agg}'
            grouped = avs.groupby('id_municipio')[col]
            values = grouped.mean() if agg == 'mean' else grouped.quantile(0.75) - grouped.quantile(0.25)
            panel[key] = panel['city'].map(values)
            feature(key, f'{name}: {label} entre UDHs', 'Socioeconômico / território', f'AVS 2010: {col}; {label} simples das UDHs, sem ponderação por população.', 'R$ de 2010' if col == 'renda_per_capita' else '%' if col == 'proporcao_sem_agua_esgoto' else 'índice', 'Apenas cinco valores municipais estáticos; associação agregada pode refletir diferenças entre cidades. Não mede mudança socioeconômica de 2021–2025.')
    day = panel['week'].dt.dayofyear
    panel['calendar_sin'] = np.sin(2 * np.pi * day / 365.2425)
    panel['calendar_cos'] = np.cos(2 * np.pi * day / 365.2425)
    feature('calendar_sin', 'Calendário: seno anual', 'Calendário', 'sin(2π·dia do ano do domingo / 365,2425).', '−1 a 1')
    feature('calendar_cos', 'Calendário: cosseno anual', 'Calendário', 'cos(2π·dia do ano do domingo / 365,2425).', '−1 a 1')
    print('Constructed panel and', len(features), 'features.', flush=True)

    def analyze(start, end, bootstraps=True):
        dev, evaluation, purged = split_masks(panel, start, end)
        thresholds, target = fit_targets(panel, dev)
        results = []
        for feature_index, spec in enumerate(features):
            key = spec['id']
            x0, y0 = panel.loc[dev, key], target[dev].astype(int)
            x1, y1 = panel.loc[evaluation, key], target[evaluation].astype(int)
            cuts, status = fit_bins(x0, y0)
            c0, c1 = counts_for(x0, y0, cuts), counts_for(x1, y1, cuts)
            r0, r1 = from_counts(c0), from_counts(c1)
            usable = status == 'ok'
            if not usable:
                r0 = {'iv': None, 'woe': [None] * len(c0), 'contribution': [None] * len(c0)}
                r1 = {'iv': None, 'woe': [None] * len(c1), 'contribution': [None] * len(c1)}
            bins = []
            for j in range(len(c0)):
                bins.append({'missing': j == len(cuts) + 1,
                             'lower': None if j == 0 or j > len(cuts) else cuts[j-1],
                             'upper': cuts[j] if j < len(cuts) else None,
                             'dev': {'nonEvent': int(c0[j, 0]), 'event': int(c0[j, 1]), 'woe': r0['woe'][j], 'contribution': r0['contribution'][j]},
                             'evaluation': {'nonEvent': int(c1[j, 0]), 'event': int(c1[j, 1]), 'woe': r1['woe'][j], 'contribution': r1['contribution'][j]}})
            comparable = [j for j in range(len(c0)) if c0[j].sum() >= 5 and c1[j].sum() >= 5 and c0[j].min() >= 1 and c1[j].min() >= 1]
            sign_same = sum(np.sign(r0['woe'][j]) == np.sign(r1['woe'][j]) for j in comparable) if usable else 0
            result = {**spec, 'status': status, 'cuts': cuts, 'ivDev': r0['iv'], 'ivEvaluation': r1['iv'],
                      'missingDev': float(x0.isna().mean()), 'missingEvaluation': float(x1.isna().mean()),
                      'psi': psi(c0, c1), 'signComparable': len(comparable), 'signSame': int(sign_same), 'bins': bins}
            if bootstraps and usable:
                for label, mask in [('devCI', dev), ('evaluationCI', evaluation)]:
                    clusters = panel.loc[mask, 'city'] + '|' + panel.loc[mask, 'week'].dt.year.astype(str)
                    result[label] = cluster_interval(panel.loc[mask, key], target[mask], cuts, clusters, seed=SEED + feature_index)
                result['cities'] = []
                for city in CITIES:
                    city_dev, city_eval = dev & panel['city'].eq(city), evaluation & panel['city'].eq(city)
                    result['cities'].append({'city': city,
                        'ivDev': from_counts(counts_for(panel.loc[city_dev, key], target[city_dev], cuts))['iv'] if panel.loc[city_dev, key].nunique(dropna=False) > 1 else None,
                        'ivEvaluation': from_counts(counts_for(panel.loc[city_eval, key], target[city_eval], cuts))['iv'] if panel.loc[city_eval, key].nunique(dropna=False) > 1 else None,
                        'evaluationRows': int(city_eval.sum()), 'events': int(target[city_eval].sum())})
            results.append(result)
        cities = []
        for city, name in CITIES.items():
            d, e = dev & panel['city'].eq(city), evaluation & panel['city'].eq(city)
            cities.append({'id': city, 'name': name, 'threshold': thresholds[city], 'devRows': int(d.sum()),
                           'devEvents': int(target[d].sum()), 'evaluationRows': int(e.sum()), 'evaluationEvents': int(target[e].sum()),
                           'devClimateRows': int((d & panel['end'].notna()).sum()), 'evaluationClimateRows': int((e & panel['end'].notna()).sum())})
        return {'evaluationStart': start, 'evaluationEnd': end, 'devRows': int(dev.sum()), 'evaluationRows': int(evaluation.sum()),
                'purgedRows': int(purged.sum()), 'devStart': panel.loc[dev, 'week'].min(), 'devEnd': panel.loc[dev, 'week'].max(),
                'cities': cities, 'features': results}, (dev, evaluation, purged, target)

    analysis, (dev, evaluation, purged, target) = analyze('2025-01-05', '2025-12-28')
    secondary, _ = analyze('2024-01-07', '2025-12-28', bootstraps=False)
    panel['target'] = target
    panel['split'] = np.select([dev, evaluation, purged, panel['burden'].isna()], ['development', 'evaluation', 'purged', 'incomplete_horizon'], default='outside_evaluation')
    panel['threshold'] = panel['city'].map({c['id']: c['threshold'] for c in analysis['cities']})
    blocks = []
    for block in dict.fromkeys(f['block'] for f in features):
        entries = [f for f in analysis['features'] if f['block'] == block]
        vals0, vals1 = [f['ivDev'] for f in entries if f['ivDev'] is not None], [f['ivEvaluation'] for f in entries if f['ivEvaluation'] is not None]
        blocks.append({'name': block, 'features': len(entries), 'estimated': len(vals0),
                       'medianDev': float(np.median(vals0)) if vals0 else None, 'maxDev': max(vals0) if vals0 else None,
                       'medianEvaluation': float(np.median(vals1)) if vals1 else None, 'maxEvaluation': max(vals1) if vals1 else None})

    stages = ['Notificações nos cinco municípios', 'Data válida', 'Município reconciliado', 'CNES no cadastro de 07/2026',
              'CNES com UDH no mesmo município', 'UDH com AVS 2010', 'Semana municipal com registro de clima']
    funnel = [{'stage': label, 'n': totals[f'funnel_{i}']} for i, label in enumerate(stages)]
    complete_keys = set(zip(panel.loc[panel['burden'].notna(), 'city'], panel.loc[panel['burden'].notna(), 'week']))
    analysis_keys = set(zip(panel.loc[dev | evaluation, 'city'], panel.loc[dev | evaluation, 'week']))
    complete_n = sum(n for c, weeks_ in funnel_weeks.items() for w, n in weeks_.items() if (c, w) in complete_keys)
    analytic_n = sum(n for c, weeks_ in funnel_weeks.items() for w, n in weeks_.items() if (c, w) in analysis_keys)
    funnel.extend([{'stage': 'Horizonte futuro completo', 'n': complete_n}, {'stage': 'Origem nos períodos de análise, após expurgo', 'n': analytic_n}])
    for i, stage in enumerate(funnel):
        stage['retained'] = stage['n'] / funnel[0]['n']
        stage['lossPrevious'] = 0 if not i else funnel[i-1]['n'] - stage['n']
    for i in range(1, len(funnel)): assert funnel[i]['n'] <= funnel[i-1]['n']

    unavailable = [
        {'metric': 'Estabilidade de revisão em 30/60/90 dias', 'reason': 'Há apenas um snapshot validado. R = |N posterior − N inicial| / max(1, N posterior) requer extrações do mesmo período em datas diferentes.'},
        {'metric': 'Melhora de qualidade Bronze → Silver → Gold', 'reason': 'Os 18 arquivos locais são Gold. Faltam contagens e denominadores comparáveis das outras camadas.'},
        {'metric': 'Atraso de publicação e disponibilidade histórica as of', 'reason': 'As datas de evento não informam quando cada registro ficou disponível. Esta é uma análise retrospectiva, não uma validação em tempo real.'},
        {'metric': 'Proveniência e recuperação por geocodificação', 'reason': 'Não há tentativas de geocodificação nesta execução nem rótulos por método nos arquivos. Ausência de execução não é taxa de sucesso zero.'},
        {'metric': 'Unicidade de indivíduos no SINAN', 'reason': 'Gold contém grupos com peso qt e não fornece identificador individual para deduplicação de pessoas. Unicidade é testada somente nas dimensões e fatos com chave declarada.'},
        {'metric': 'Capacidade histórica e heterogeneidade de casos por UDH', 'reason': 'CNES/UDH é um retrato de julho de 2026. Atribuí-lo a 2021–2025 pode criar informação futura. Usa-se apenas atividade dos IDs notificantes como proxy; não se estima incidência residencial por UDH.'},
        {'metric': 'Máscaras e códigos válidos na fonte bruta', 'reason': 'O Gold já possui tipos e rótulos transformados. Este painel verifica tipos, presença, domínios numéricos e vínculos observáveis, sem atribuir conformidade aos códigos brutos não disponíveis.'},
    ]
    method = {
        'title': 'Métricas do manuscrito · edição pública VIGIAR', 'schemaVersion': 1,
        'builtAt': datetime.now(timezone.utc).isoformat(), 'runId': manifest['run_id'],
        'paper': {'title': 'A multiscale dataset for dengue surveillance in Brazil: health facilities, UDH-level socioeconomic indicators, and WOE/IV analysis',
                  'status': 'Manuscrito fornecido pelo autor, com resultados e tabelas ainda em elaboração; não republicado.', 'sha256': PAPER_SHA},
        'sources': sources, 'range': {'min': min_date, 'max': max_date, 'firstFullWeek': first_sunday, 'lastFullWeek': last_sunday, 'lastFullDay': last_saturday},
        'totals': dict(totals), 'annual': dict(annual), 'panelRows': len(panel), 'featureCount': len(features),
        'protocol': [
            'Unidade: município de notificação × semana domingo–sábado. A origem t é o encerramento da semana; somam-se todas as notificações, não apenas confirmações.',
            'Alvo B(u,t) = y(u,t+1)+y(u,t+2)+y(u,t+3)+y(u,t+4). Evento se B ≥ quantil 0,80 de B no desenvolvimento daquele município. Empates são positivos. Não é definição sanitária de surto nem previsão clínica.',
            'Desenvolvimento adaptado: origens 03/01/2021–01/12/2024. Expurgo de 08, 15, 22 e 29/12/2024: os rótulos atravessariam a fronteira. Avaliação: 05/01–28/12/2025 (52 semanas/cidade). Rótulos finais usam janeiro de 2026.',
            'Até cinco intervalos por quantis no desenvolvimento, comuns às cinco cidades. Mescla de vizinhos com <5% das linhas de desenvolvimento ou <5 exemplos de qualquer classe. Categoria ausente separada; limites congelados na avaliação.',
            'p(j,c) = [n(j,c)+0,5] / [N(c)+0,5·J]; J inclui a categoria ausente reservada. WOE = ln[p(j,0)/p(j,1)]; IV = Σ[p(j,0)−p(j,1)]·WOE. WOE positivo favorece não-eventos; negativo favorece eventos.',
            'IC 95%: 500 reamostragens de conglomerados município–ano, semente 20260909 + índice da variável. Bins e limiares ficam fixos: intervalos condicionais, sem incerteza da escolha dos bins/limiar. Desenvolvimento tem 20 conglomerados; avaliação apenas 5, com incerteza pouco identificada.',
            'PSI usa as ocupações dos mesmos bins e pseudocontagem 0,5. Mede mudança de distribuição, não poder discriminativo. Não se aplicam faixas universais de IV ou PSI nem se somam IVs correlacionados.',
            'WOE e IV da avaliação são recalculados com seus rótulos apenas para diagnóstico. Não são transformações ajustadas para uso preditivo em 2025. A classificação das variáveis usa exclusivamente IV de desenvolvimento.',
            'Semanas sem linhas são zero notificações registradas, assumindo completude da extração; não demonstram ausência de transmissão. Valores ausentes de clima não são zero; não há dados de clima de Manaus/Recife neste snapshot.',
            'CNES de 07/2026 é usado apenas no diagnóstico retrospectivo de junções. Preditores da rede usam os IDs presentes nas notificações até t. AVS 2010 é estático e agregado sem pesos populacionais; não autoriza interpretação individual ou causal.',
            'Análise secundária: desenvolvimento até 03/12/2023, expurgo de quatro origens e avaliação de 07/01/2024 a 28/12/2025. Reajusta limiares e bins somente nesse desenvolvimento; sem IC secundário.',
            'A correção de datas e os resultados são desta edição agregada do site. Os Parquets e a transformação da plataforma original não foram alterados.'
        ],
        'differences': [
            {'topic': 'Histórico de desenvolvimento', 'paper': '2010–2024', 'edition': '2021–2024, com expurgo temporal. Não reproduz integralmente o artigo.'},
            {'topic': 'Avaliação 2025', 'paper': '255 município-semanas (51 × 5), com números preliminares', 'edition': f"{analysis['evaluationRows']} município-semanas (52 × 5); semanas fixas e quatro semanas futuras observadas."},
            {'topic': 'UDHs nos cinco municípios', 'paper': 'Aproximadamente 1.250, sem Cuiabá na descrição', 'edition': '1.961: Rio 1.136; Porto Alegre 335; Manaus 200; Recife 194; Cuiabá 96.'},
            {'topic': 'CNES', 'paper': 'Série histórica de estabelecimentos', 'edition': 'Um snapshot de julho de 2026: 631.973 linhas. Não usado como preditor histórico.'},
            {'topic': 'Dimensão de municípios', 'paper': 'Uma linha por município', 'edition': '27.748 linhas / 5.565 códigos; chave composta inclui ano, UDH e recortes sociodemográficos. Repetir apenas o código não é duplicação da chave completa.'},
            {'topic': 'Volume SINAN', 'paper': '34,7 milhões / 151 colunas no escopo amplo', 'edition': f"{totals['rows']:,} grupos / 141 colunas; Σqt = {n:,} notificações, 2021–junho/2026. Não somar fat_notificacoes a fat_sinan."}
        ],
        'unavailable': unavailable,
        'timelinessNotes': [
            'Quantis ponderados por qt, por inversa da distribuição empírica; somente intervalos não negativos. Ausentes e negativos aparecem separadamente. Valores extremos permanecem no cálculo e são exibidos no máximo/p95.',
            'Sintomas → notificação recalculado como data_notificacao − data_primeiros_sintomas. O campo legado usa o sinal contrário.',
            'Notificação → encerramento reconstruído de qt_dias_encerramento − (notificação − sintomas), ou diretamente do campo quando sintomas ausentes. A transformação original censura durações anteriores ao início dos sintomas. Não há data bruta de encerramento para validação independente.',
            'Não encerrados = flag_caso_encerrado ≠ 1, na extração. Não se confunde não encerrado com intervalo de encerramento ausente.'
        ],
        'funnelNote': 'Funil de enriquecimento completo, cumulativo e ponderado por qt nos cinco municípios. Exige CNES atual com UDH no MESMO município, AVS e linha de clima. É diagnóstico retrospectivo. O painel WOE/IV usa todas as semanas elegíveis, mantém clima ausente como categoria e não se restringe a este funil; faltas de CNES não retiram notificações do alvo.',
        'completenessNote': 'Completude física = 1 − nulos/linhas de grupos Gold, obtida dos metadados Parquet. Não ponderada por qt; não mede vazios textuais, códigos ignorados ou campos não aplicáveis. Colunas clínicas podem ter ausência estrutural. Não há nota composta de qualidade.',
    }
    quality = {'inventory': list(inventory.values()), 'missingness': missing_rows, 'checks': checks,
               'timeliness': timeliness, 'spatial': spatial, 'funnel': funnel}
    analysis['blocks'] = blocks
    analysis['secondary'] = secondary
    panel_export = panel[['city', 'week', 'notifications', 'burden', 'threshold', 'target', 'split', 'reporter_coverage', *[f['id'] for f in features if f['id'] != 'notifications']]].copy()
    panel_export['week'] = panel_export['week'].dt.strftime('%Y-%m-%d')
    # Fail closed before writing public artifacts.
    assert len(panel_export) == len(CITIES) * len(weeks)
    assert not panel_export.duplicated(['city', 'week']).any()
    assert not (set(panel_export.columns) & {'id_cnes', 'data_nascimento_paciente', 'sexo_paciente', 'data_primeiros_sintomas'})
    for name, obj in [('method.json', method), ('quality.json', quality), ('analysis.json', analysis), ('panel.json', panel_export.to_dict('records'))]:
        (out / name).write_text(json.dumps(clean(obj), ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    panel_export.to_csv(out / 'municipality-week.csv', index=False, float_format='%.8g', lineterminator='\n')
    pd.DataFrame(missing_rows).to_csv(out / 'completeness.csv', index=False, lineterminator='\n')
    pd.DataFrame([{k: f.get(k) for k in ['id', 'name', 'block', 'status', 'ivDev', 'ivEvaluation', 'missingDev', 'missingEvaluation', 'psi']} for f in analysis['features']]).to_csv(out / 'woe-iv.csv', index=False, lineterminator='\n')
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir()) if p.is_file() and p.name != 'manifest.json'}
    (out / 'manifest.json').write_text(json.dumps({'schemaVersion': 1, 'runId': manifest['run_id'], 'files': hashes}, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(clean({'notifications': n, 'panelRows': len(panel), 'dev': analysis['devRows'], 'evaluation': analysis['evaluationRows'],
                           'features': len(features), 'cities': analysis['cities'], 'top': sorted([{'name': f['name'], 'ivDev': f['ivDev'], 'ivEvaluation': f['ivEvaluation']} for f in analysis['features'] if f['ivDev'] is not None], key=lambda x: -x['ivDev'])[:5]}), ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
