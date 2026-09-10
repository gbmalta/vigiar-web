"""Render the archived Airflow DAG; never execute or change the orchestration."""
from pathlib import Path
import ast
import hashlib
import html
import json
import zipfile
import argparse

SITE = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--release-dir', type=Path, required=True)
RELEASE = parser.parse_args().release_dir
archive = zipfile.ZipFile(RELEASE / 'vigiar_pipeline_code.zip')
hashes = json.loads((RELEASE / 'recovery_evidence/code_sha256.json').read_text('utf-8'))
sources = {}
for name in ('airflow/dags/vigiar_commands.py','airflow/dags/vigiar_manual.py'):
    content = archive.read(name)
    assert hashlib.sha256(content).hexdigest() == hashes[name]
    sources[name] = content.decode('utf-8')
commands = ast.parse(sources['airflow/dags/vigiar_commands.py'])
constants = {}
for node in commands.body:
    if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
        if node.targets[0].id in ('DATASETS','PIPELINE_DEPENDENCIES'):
            constants[node.targets[0].id] = ast.literal_eval(node.value)
manual = sources['airflow/dags/vigiar_manual.py']
assert 'readiness >> execution' in manual and 'executions[upstream] >> executions[downstream]' in manual
assert 'max_active_tasks=1' in manual and 'retries=0' in manual
run = json.loads((RELEASE / 'recovery_evidence/run.json').read_text('utf-8'))
tasks = {t['task_id']:t for t in run['tasks']}
datasets = list(constants['DATASETS'])
assert set(tasks) == {'validate_execution_environment', *('run_'+d for d in datasets)}
assert run['run']['state'] == 'success' and all(t['state']=='success' for t in tasks.values())
edges = [('validate_execution_environment','run_'+d) for d in datasets]
edges += [('run_'+parent,'run_'+child) for child,parents in constants['PIPELINE_DEPENDENCIES'].items() for parent in parents]
assert len(tasks) == 11 and len(edges) == 12
order = [d for d in datasets if d != 'dim_cnes_udh']
labels = {'dim_calendario':'Calendário','dim_municipios':'Municípios','dim_udh':'Áreas UDH','dim_cnes':'Estabelecimentos CNES','dim_cnes_udh':'Vínculo CNES + UDH','fat_avs':'Vulnerabilidade social','fat_clima':'Clima','fat_notificacoes':'Notificações','fat_sinan':'SINAN detalhado','fat_dieese':'Cesta básica · DIEESE'}
root = 'validate_execution_environment'
positions = {root:(54,28,344,116)}
for i,dataset in enumerate(order): positions['run_'+dataset]=(54,210+i*116,344,96)
positions['run_dim_cnes_udh']=(54,1300,344,108)
esc = html.escape
svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="460" height="1512" viewBox="0 0 460 1512" role="img" aria-labelledby="title desc">',
 '<title id="title">DAG vigiar_manual_pipeline — carga 2021 a 2026</title>',
 '<desc id="desc">Onze tarefas concluídas. Validar ambiente antecede as dez tarefas de dados. Vínculo CNES mais UDH também depende de Áreas UDH e Estabelecimentos CNES. Uma tarefa ativa por vez; os ramos não indicam execução simultânea.</desc>',
 '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#7a9391"/></marker><marker id="join-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#b77d2c"/></marker></defs>',
 '<rect width="460" height="1512" rx="18" fill="#f6f8f6"/>',
 '<g fill="none" stroke="#7a9391" stroke-width="2">',
 '<path d="M226 144 V178 H24 V1354"/>']
for source,target in edges:
    x,y,w,h=positions[target]
    if source == root:
        svg.append(f'<path data-source="{source}" data-target="{target}" d="M24 {y+h/2} H{x}" marker-end="url(#arrow)"/>')
    else:
        sx,sy,sw,sh=positions[source]
        lane=418 if source=='run_dim_udh' else 438
        dest=1328 if source=='run_dim_udh' else 1380
        svg.append(f'<path data-source="{source}" data-target="{target}" d="M{sx+sw} {sy+sh/2} H{lane} V{dest} H{x+w}" stroke="#b77d2c" marker-end="url(#join-arrow)"/>')
svg.append('</g>')
for task_id,(x,y,w,h) in positions.items():
    task=tasks[task_id]
    seconds=round(task['duration'])
    duration=f'{seconds//60}m {seconds%60:02d}s' if seconds>=60 else f'{seconds}s'
    label='Validar ambiente' if task_id==root else labels[task_id.removeprefix('run_')]
    fill='#163e40' if task_id==root else '#ffffff'
    ink='#ffffff' if task_id==root else '#183f3c'
    muted='#c2ded3' if task_id==root else '#5b7670'
    svg.extend([f'<g data-task-id="{task_id}">',f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="'+('#b77d2c' if task_id=='run_dim_cnes_udh' else '#cdded5')+'"/>',f'<text x="{x+16}" y="{y+29}" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="{ink}">{esc(label)}</text>',f'<text x="{x+16}" y="{y+54}" font-family="Arial,sans-serif" font-size="17" fill="{muted}">{task_id}</text>',f'<text x="{x+16}" y="{y+80}" font-family="Arial,sans-serif" font-size="17" fill="{muted}">Sucesso · tentativa {task["try_number"]}</text>',f'<text x="{x+w-16}" y="{y+80}" text-anchor="end" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="{ink}">{duration}</text>','</g>'])
svg += ['<g font-family="Arial,sans-serif" font-size="17" fill="#52716a"><path d="M54 1452 H89" stroke="#b77d2c" stroke-width="3"/><text x="100" y="1458">Dependências adicionais do vínculo</text><text x="54" y="1487">Setas = pré-requisitos; não ordem cronológica.</text></g>','</svg>']
destination=SITE/'public/diagrams'
destination.mkdir(exist_ok=True)
(destination/'vigiar-airflow-dag.svg').write_text('\n'.join(svg),encoding='utf-8')
evidence={'dagId':run['run']['dag_id'],'runId':run['run']['run_id'],'runState':run['run']['state'],'startUtc':run['run']['start_date'],'endUtc':run['run']['end_date'],'maxActiveTasks':1,'taskCount':len(tasks),'edgeCount':len(edges),'edges':[{'source':a,'target':b} for a,b in edges],'tasks':run['tasks'],'sourceHashes':{n:hashes[n] for n in sources},'note':'DAG reconstructed from archived code, with task status and duration from archived Airflow metadata; not a screenshot or live monitor.'}
(SITE/'docs/dag-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Validated {len(tasks)} task nodes, {len(edges)} dependency edges; both source hashes match the release.')
