"""Build the public implementation report from the measured analytics, as PDF and Markdown.
Run after build-article-analytics.py. Requires ReportLab and an Arial-compatible TTF family.
"""
from pathlib import Path
from datetime import datetime, timezone, timedelta
from html import escape
import hashlib
import json
import shutil
import argparse
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/analytics'
OUT = ROOT / 'output/pdf'
SITE = 'https://gbmalta.github.io/vigiar-web/'
REPO = 'https://github.com/gbmalta/vigiar-web'


def fmt(v, d=0):
    if v is None: return 'não estimado'
    return f'{v:,.{d}f}'.replace(',', '~').replace('.', ',').replace('~', '.')


def pc(v, d=2): return fmt(v * 100, d) + '%'


def plain(s):
    return str(s).replace('\u2011', '-').replace('–', '-').replace('—', '-').replace('−', '-').replace('\u00a0', ' ')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font-dir', type=Path, default=Path('C:/Windows/Fonts'))
    args = parser.parse_args()
    for name, file in [('Arial', 'arial.ttf'), ('Arial-Bold', 'arialbd.ttf'), ('Arial-Italic', 'ariali.ttf')]:
        pdfmetrics.registerFont(TTFont(name, str(args.font_dir / file)))
    pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold', italic='Arial-Italic', boldItalic='Arial-Bold')
    m, q, a = [json.loads((PUBLIC / f'{name}.json').read_text('utf8')) for name in ['method', 'quality', 'analysis']]
    t = m['totals']
    national = next(x for x in q['timeliness'] if x['scope'] == 'Brasil')
    top = sorted(a['features'], key=lambda x: -(x['ivDev'] or 0))
    now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=-3)))
    stamp = now.strftime('%d/%m/%Y %H:%M') + ' (Brasília)'
    OUT.mkdir(parents=True, exist_ok=True)
    deliver = ROOT / 'public/research'
    deliver.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    ink, muted, teal, border = [colors.HexColor(x) for x in ['#183E35', '#587164', '#176B60', '#D9E3DB']]
    styles.add(ParagraphStyle('BodyV', fontName='Arial', fontSize=10, leading=15, textColor=ink, spaceAfter=9))
    styles.add(ParagraphStyle('SmallV', parent=styles['BodyV'], fontSize=8.4, leading=12, textColor=muted, spaceAfter=7))
    styles.add(ParagraphStyle('TinyV', parent=styles['BodyV'], fontSize=7.8, leading=10.5, spaceAfter=0))
    styles.add(ParagraphStyle('H1V', fontName='Arial-Bold', fontSize=24, leading=29, textColor=ink, spaceAfter=16))
    styles.add(ParagraphStyle('H2V', fontName='Arial-Bold', fontSize=17, leading=22, textColor=ink, spaceBefore=6, spaceAfter=14))
    styles.add(ParagraphStyle('H3V', fontName='Arial-Bold', fontSize=11, leading=15, textColor=teal, spaceBefore=12, spaceAfter=7))
    styles.add(ParagraphStyle('Kicker', fontName='Arial-Bold', fontSize=8, leading=11, textColor=teal, spaceAfter=12, charSpace=1))
    styles.add(ParagraphStyle('CellV', fontName='Arial', fontSize=8.4, leading=11.5, textColor=ink))
    styles.add(ParagraphStyle('HeadV', parent=styles['CellV'], fontName='Arial-Bold', fontSize=8, leading=11, textColor=muted))
    styles.add(ParagraphStyle('CodeV', parent=styles['SmallV'], fontName='Arial', fontSize=8, leading=12, backColor=colors.HexColor('#EFF4ED'), borderPadding=9, spaceBefore=7, spaceAfter=14))
    story, md = [], []
    def p(text, style='BodyV', markdown=True):
        story.append(Paragraph(escape(plain(text)).replace('\n', '<br/>'), styles[style]))
        if markdown: md.append(plain(text) + '\n')
    def heading(title, first=False):
        if not first: story.append(PageBreak())
        p('VIGIAR / CADERNO DE EVIDÊNCIAS', 'Kicker', False)
        story.append(Paragraph(escape(plain(title)), styles['H1V' if first else 'H2V']))
        md.append(('# ' if first else '## ') + plain(title) + '\n')
    def sub(title):
        story.append(Paragraph(escape(plain(title)), styles['H3V']))
        md.append('### ' + plain(title) + '\n')
    def table(headers, rows, widths, small=False):
        cell_style = styles['TinyV' if small else 'CellV']
        content = [[Paragraph(escape(plain(x)), styles['HeadV']) for x in headers]]
        content += [[Paragraph(escape(plain(x)), cell_style) for x in row] for row in rows]
        tbl = Table(content, colWidths=widths, repeatRows=1, hAlign='LEFT')
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EFF4ED')),
            ('LINEBELOW', (0, 0), (-1, 0), .6, border),
            ('LINEBELOW', (0, 1), (-1, -1), .35, border),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ]))
        story.append(tbl); story.append(Spacer(1, 12))
        md.append('| ' + ' | '.join(plain(x).replace('|', '/') for x in headers) + ' |')
        md.append('|' + '|'.join('---' for _ in headers) + '|')
        md.extend('| ' + ' | '.join(plain(x).replace('|', '/') for x in row) + ' |' for row in rows)
        md.append('')
    def link(label, url):
        story.append(Paragraph(f'<link href="{escape(url)}" color="#176B60"><u>{escape(label)}</u></link>', styles['BodyV']))
        md.append(f'[{label}]({url})\n')

    heading('Métricas do artigo e publicação do VIGIAR', True)
    p('Relatório de implementação, resultados e limitações', 'H3V')
    p(stamp, 'SmallV')
    p('A área “Métricas do artigo” amplia o observatório público com qualidade dos dados, integração entre fontes, tempos de notificação e encerramento, um alvo futuro de quatro semanas e análise exploratória WOE/IV. O mapa, suas camadas e os relatórios anteriores continuam acessíveis.')
    link('Abrir as métricas no site público', SITE + '#metricas')
    link('Repositório e histórico das publicações', REPO)
    table(['Resultado', 'Medida nesta edição'], [
        ['Carga analisada', '18 Parquets validados; 12.506.888 notificações representadas por 12.493.876 grupos SINAN Gold'],
        ['Recorte territorial', '5 municípios de estudo, 1.961 UDHs e diagnóstico nacional de qualidade'],
        ['Painel semanal', '1.430 origens completas de semana; 1.025 no desenvolvimento, 260 na avaliação 2025 e 20 no expurgo'],
        ['Variáveis', '45 candidatas em 6 blocos; WOE, IV, PSI e intervalos por bootstrap de município-ano'],
        ['Eventos na avaliação', '59 de 260 origens (22,69%), pelos limiares municipais fixados no desenvolvimento'],
        ['Automação', 'Validação em pull requests; build, publicação e conferência HTTP por hashes em main'],
    ], [140, 363])
    sub('Decisão principal')
    p('Interpretei a referência ao artigo como um pedido para incorporar suas métricas de qualidade e sua análise WOE/IV ao site existente. Usei a carga local validada, sem executar nova extração na nuvem. Como o histórico disponível começa em 2021, adaptei o protocolo temporal e identifiquei a edição como exploratória, sem alegar reprodução dos números preliminares do manuscrito.')
    p('As decisões que mais merecem revisão são o histórico 2021-2024, a definição de semana domingo-sábado, o alvo relativo Q80 e a exclusão do cadastro CNES de 2026 dos preditores históricos.', 'SmallV')

    heading('1. Correspondência com o manuscrito')
    p(m['paper']['title'], 'BodyV')
    p('Documento fornecido na conversa, com 14 páginas, tabelas em elaboração e figuras ainda indicadas como placeholders. O arquivo do manuscrito não foi publicado. Os valores abaixo são calculados da carga Gold, não copiados como resultados finais do artigo.', 'SmallV')
    table(['Tema', 'Manuscrito', 'Implementação'], [[x['topic'], x['paper'], x['edition']] for x in m['differences']], [99, 160, 244])
    sub('Métricas efetivamente adicionadas')
    p('Completude por fonte/campo; unicidade nas chaves declaradas; plausibilidade de datas e clima; consistência de calendário e agregados; integridade referencial; cobertura de coordenadas e UDHs; funil cumulativo de junções; quantis de atraso; prevalência do alvo; WOE por faixa; IV com IC de 95%; estabilidade entre períodos e cidades; PSI e análise secundária em 2024-2025.')
    p('Métricas sem dados suficientes são exibidas como indisponíveis: revisão em 30/60/90 dias, ganhos Bronze-Silver-Gold, latência de disponibilização, recuperação por geocodificação e capacidade histórica da rede CNES. Não se atribui zero a medições inexistentes.', 'SmallV')

    heading('2. Qualidade: denominadores e achados')
    table(['Dimensão', 'O que foi medido / limite'], [
        ['Completude', '1 - nulos/linhas físicas Gold, por campo. Não equivale a validade semântica ou presença de informação aplicável.'],
        ['Conformidade', 'Tipos Gold, datas dentro do intervalo e chaves reconhecidas; máscaras e códigos brutos não disponíveis.'],
        ['Plausibilidade', 'Ordem de datas, sinais dos atrasos, chuva e vento não negativos, umidade 0-100 e ordem de temperaturas.'],
        ['Unicidade', 'Chaves de dimensões, AVS e clima. Não há chave individual para deduplicar pessoas no SINAN.'],
        ['Consistência', 'Somas anuais reproduzem exatamente o mapa; semana dos sintomas comparada à dimensão; sinal do atraso legado auditado.'],
        ['Oportunidade', 'Quantis ponderados por qt; sintomas-notificação e encerramento reconstruído; não encerrados separados.'],
        ['Estabilidade de revisão', 'Não mensurável com um único snapshot. Fórmula e necessidade de novas extrações documentadas.'],
        ['Validade espacial', 'Coordenadas numéricas e limites geográficos; vínculos à UDH da ponte existente. Não prova endereço correto.'],
        ['Integridade referencial', 'Correspondências / chaves presentes; presença da chave informada separadamente.'],
        ['Prontidão analítica', 'Funil de enriquecimento por notificações; painel analítico separado, mantendo covariáveis ausentes.'],
    ], [103, 400])
    sub('Pontos que exigem atenção na plataforma de dados')
    p(f"O campo legado de atraso coincide com sintomas - notificação em {fmt(t['legacy_reversed'])} pares. Em {fmt(t['legacy_disagrees'])} deles o sinal difere do intervalo notificação - sintomas. A correção foi aplicada apenas ao cálculo do site; os Parquets e o pipeline original não foram alterados.")
    p(f"A numeração da semana dos sintomas diverge da dimensão em {fmt(t['epi_comparable'] - t['epi_match'])} notificações elegíveis (3,24%). São 403.671 em notificações de 2026 e 1.266 em 2025, além de 7 em 2022-2024. A dimensão usa semana ISO após deslocar a data em um dia; convém revisar a convenção de ano/semana antes de alterar registros. O painel novo une por datas, evitando depender desse número.", 'SmallV')
    p('Data de nascimento está ausente em todas as linhas do snapshot; sua plausibilidade é “não estimada”. Não se interpreta o denominador zero como aprovação da regra.', 'SmallV')

    heading('3. Tempos de notificação e encerramento')
    p('Todas as distribuições abaixo são ponderadas por qt. Os quantis usam a inversa da distribuição empírica apenas para intervalos não negativos; ausentes e negativos aparecem separadamente. Dias extremos não foram truncados.')
    table(['Recorte', 'Mediana sintomas → notificação', 'Q25 / Q75', 'P90 / P95', 'Não encerrados'], [
        [x['name'], fmt(x['notification']['median']), f"{fmt(x['notification']['q25'])} / {fmt(x['notification']['q75'])}", f"{fmt(x['notification']['p90'])} / {fmt(x['notification']['p95'])}", f"{fmt(x['open'])} ({pc(x['open']/x['total'])})"]
        for x in q['timeliness'] if x['scope'] in ['Brasil', '2021', '2022', '2023', '2024', '2025', '2026']
    ], [60, 116, 80, 78, 169])
    sub('Brasil: sintomas até notificação')
    p(f"Mediana de {fmt(national['notification']['median'])} dias, intervalo interquartil {fmt(national['notification']['q25'])}-{fmt(national['notification']['q75'])}, P90 de {fmt(national['notification']['p90'])} e P95 de {fmt(national['notification']['p95'])}. Há {fmt(national['notification']['valid'])} intervalos não negativos, {fmt(t['notifications'] - t['delay_present'])} ausentes e {fmt(t['delay_negative'])} negativos. Máximo observado: {fmt(national['notification']['max'])} dias.")
    sub('Brasil: notificação até encerramento, reconstruído')
    p(f"Mediana de {fmt(national['closure']['median'])} dias, intervalo interquartil {fmt(national['closure']['q25'])}-{fmt(national['closure']['q75'])}, P90 de {fmt(national['closure']['p90'])} e P95 de {fmt(national['closure']['p95'])}. São {fmt(national['closure']['valid'])} intervalos não negativos e {fmt(t['closure_negative'])} negativos. {fmt(t['notifications'] - t['closure_present'])} notificações não possuem intervalo reconstruível.")
    p('A duração Gold de encerramento começa no início dos sintomas, ou na notificação quando sintomas estão ausentes. Para obter o intervalo pedido no artigo, subtrai-se notificação - sintomas. A fonte já descarta encerramentos anteriores ao início dos sintomas. Não há data bruta de encerramento para validação independente; esta limitação acompanha todos os resultados.', 'SmallV')
    p(f"O indicador de não encerramento usa a flag, não a disponibilidade da duração. São {fmt(national['open'])} notificações não encerradas ({pc(national['open']/national['total'])}) no snapshot. Em 2026 o percentual é maior também por se tratar de um período recente e parcial; não se conclui piora operacional apenas dessa comparação.", 'SmallV')

    heading('4. Integração e cobertura espacial')
    p('O funil usa notificações nos cinco municípios, sempre ponderadas por qt. Cada etapa restringe a anterior. Vínculos CNES de 07/2026 e AVS 2010 são diagnósticos retrospectivos.')
    table(['Etapa cumulativa', 'Notificações', 'Retenção', 'Perda na etapa'], [[x['stage'], fmt(x['n']), pc(x['retained']), fmt(x['lossPrevious'])] for x in q['funnel']], [254, 90, 76, 83])
    table(['Município', 'CNES', 'Coords. nos limites¹', 'Com UDH', 'UDHs'], [[x['name'], fmt(x['facilities']), fmt(x['bounds']), fmt(x['linked']), fmt(x['udh'])] for x in q['spatial']], [131, 81, 118, 91, 82])
    p('¹ Caixa geográfica do Brasil: latitude -34 a 6; longitude -74 a -28. Há 49.264 estabelecimentos nos cinco municípios, 42.370 com pares de coordenadas numéricas, 42.368 dentro dos limites e 39.980 associados a UDH. Dois pares numéricos estão fora dos limites. Nenhuma geocodificação adicional foi executada.', 'SmallV')
    p('O funil termina em 232.007 notificações enriquecidas (76,70% do início). Isso não é a amostra de WOE/IV: o painel usa todas as semanas elegíveis, preserva o total municipal e inclui a ausência de clima como categoria. Há linha de clima em 2025 para Rio, Porto Alegre e Cuiabá; Manaus e Recife não possuem esse vínculo nesta carga.', 'SmallV')

    heading('5. Alvo futuro e separação temporal')
    p('Unidade: município de notificação por semana de domingo a sábado. A origem t é o fim da semana, quando se consideram conhecidos os registros até t. Não se interpreta o município como local de residência ou de infecção.')
    p('B(u,t) = y(u,t+1) + y(u,t+2) + y(u,t+3) + y(u,t+4)\nEvento = 1 quando B(u,t) ≥ Q80 de B no desenvolvimento do município.', 'CodeV')
    table(['Partição', 'Origens semanais', 'Município-semanas'], [
        ['Desenvolvimento', '03/01/2021 a 01/12/2024', '1.025 (205 por cidade)'],
        ['Expurgo', '08, 15, 22 e 29/12/2024', '20 (4 por cidade)'],
        ['Avaliação principal', '05/01/2025 a 28/12/2025', '260 (52 por cidade)'],
        ['Fora da avaliação / horizonte incompleto', 'Demais origens de 2026', '125; 20 sem as quatro semanas futuras'],
    ], [145, 240, 118])
    table(['Município', 'Limiar Q80', 'Eventos dev.', 'Eventos 2025', 'Taxa 2025'], [[x['name'], fmt(x['threshold'], 1), f"{x['devEvents']}/{x['devRows']}", f"{x['evaluationEvents']}/{x['evaluationRows']}", pc(x['evaluationEvents']/x['evaluationRows'])] for x in a['cities']], [144, 88, 87, 94, 90])
    p('59 de 260 origens de avaliação atingem o limiar (22,69%). Rio e Manaus não têm eventos em 2025 sob essa definição, portanto seu IV de avaliação local fica indisponível. Empates no limiar contam como evento; 20% no desenvolvimento não é uma prevalência garantida para qualquer base.')
    p('A carga de notificações termina em 29/06/2026; a última semana completa termina em 27/06/2026. As quatro últimas origens têm rótulo ausente. A avaliação de dezembro/2025 usa notificações de janeiro/2026. Semanas sem linhas significam zero registros na extração, sob hipótese de completude, e não ausência de transmissão.', 'SmallV')
    p('Não há snapshots “as of” para reproduzir o que se sabia na data original. Datas e defasagens evitam usar semanas futuras nos preditores, mas não eliminam revisão retrospectiva ou atraso de chegada à fonte. O alvo é carga relativa de notificações, não uma definição de surto.', 'SmallV')

    heading('6. WOE, IV e incerteza')
    p('Até cinco intervalos por quantis do desenvolvimento; limites comuns às cinco cidades. Vizinhos com menos de 5% da amostra ou menos de cinco exemplos de alguma classe são mesclados. Ausentes têm categoria separada. Limites, regra de suavização e limiares são congelados para a avaliação.')
    p('p(j,c) = [n(j,c) + 0,5] / [N(c) + 0,5 × J]\nWOE(j) = ln[p(j,0) / p(j,1)]\nIV = soma de [p(j,0) - p(j,1)] × WOE(j)', 'CodeV')
    p('J inclui a categoria ausente reservada, mesmo quando não observada. WOE positivo favorece não-eventos e negativo favorece eventos. Sem ambas as classes, ou sem variação utilizável, o IV não é estimado.')
    table(['Variável (ordem pelo desenvolvimento)', 'IV dev.', 'IV 2025', 'PSI'], [[x['name'], fmt(x['ivDev'], 4), fmt(x['ivEvaluation'], 4), fmt(x['psi'], 4)] for x in top[:10]], [266, 79, 79, 79])
    sub('Intervalos e interpretação')
    lead = top[0]
    p(f"Para '{lead['name']}', IV dev. = {fmt(lead['ivDev'],4)}, IC 95% [{fmt(lead['devCI']['low'],3)}; {fmt(lead['devCI']['high'],3)}]. Em 2025, IV = {fmt(lead['ivEvaluation'],4)}, IC [{fmt(lead['evaluationCI']['low'],3)}; {fmt(lead['evaluationCI']['high'],3)}]. O histórico recente domina este ranking, resultado esperado para um alvo construído a partir das notificações futuras, sem provar previsão útil em tempo real.")
    p('ICs: 500 reamostragens de conglomerados município-ano, sementes 20260909 + índice da variável; percentis 2,5 e 97,5. Bins e limiares ficam fixos, portanto o IC é condicional a essas escolhas. São 20 conglomerados no desenvolvimento e apenas 5 na avaliação. Réplicas sem as duas classes são descartadas e contadas; a variável líder tem 497 réplicas válidas em 2025.', 'SmallV')
    p('A WOE de 2025 é recalculada com rótulos de avaliação somente para diagnóstico. Não é uma codificação ajustada para previsão de 2025. PSI mede mudança de distribuição; não é qualidade de classificação. Não se usam faixas universais de IV nem se somam IVs de variáveis correlacionadas.', 'SmallV')

    heading('7. Blocos, sensibilidade e variáveis estáticas')
    table(['Bloco', 'N', 'IV mediano dev.', 'IV máximo dev.', 'IV mediano 2025'], [[b['name'], b['features'], fmt(b['medianDev'], 4), fmt(b['maxDev'], 4), fmt(b['medianEvaluation'], 4)] for b in a['blocks']], [178, 35, 95, 95, 100])
    sub('O que cada bloco representa')
    p('Histórico: contagem em t, defasagens de 1, 2, 4, 8, 13 e 52 semanas, média/soma/desvio/máximo em 4 e 8 semanas. Dinâmica: diferenças, crescimento regularizado, aceleração e contraste com 52 semanas atrás. Clima: chuva, temperatura, umidade e vento em t, lag 4 e média de 4 semanas.')
    p('Rede notificante: número de CNES ativos nos registros da semana, HHI e participação do maior notificante. Isso mede atividade de reporte, não capacidade de atendimento. Socioeconômico/território: médias e intervalos interquartis de IVS, IDHM, renda e saneamento nas UDHs, sem pesos populacionais, todos de 2010. Calendário: seno e cosseno anual.')
    sub('Corte secundário 2024-2025')
    secondary = a['secondary']
    secondary_lead = next(x for x in secondary['features'] if x['id'] == lead['id'])
    p(f"Desenvolvimento até 03/12/2023 ({fmt(secondary['devRows'])} origens), expurgo de quatro semanas e avaliação de 07/01/2024 a 28/12/2025 ({fmt(secondary['evaluationRows'])} origens). Limiares e bins são reajustados apenas no novo desenvolvimento. Para a variável líder da análise principal, o IV é {fmt(secondary_lead['ivDev'],4)} no desenvolvimento e {fmt(secondary_lead['ivEvaluation'],4)} na avaliação secundária. Não se estimou IC secundário.")
    sub('Restrições relevantes')
    p('Variáveis AVS têm apenas cinco valores municipais estáticos: a associação agrupada pode refletir diferenças entre cidades, e não efeito causal ou capacidade de antecipar mudanças dentro de uma cidade. IV local de variável constante fica indisponível. A categoria de clima ausente também pode identificar a cidade; seus resultados exigem essa leitura.')
    p('Os preditores não usam óbito, classificação final, encerramento nem o target legado. O cadastro CNES/UDH de 2026 não foi retroativamente introduzido nos preditores. A heterogeneidade territorial de casos por UDH e a capacidade histórica da rede permanecem pendentes de dados temporais compatíveis.', 'SmallV')

    heading('8. Publicação, testes e manutenção')
    p('A aplicação continua estática em React + Vite, hospedada no GitHub Pages público. O novo módulo é carregado pela rota #metricas. Gráficos possuem tabelas equivalentes, filtros por cidade/ano/bloco e downloads de agregados. O mapa mantém o caminho original e passa a oferecer um link para as métricas.')
    table(['Etapa', 'Verificação configurada'], [
        ['Pull request', 'Instalação pelo lockfile, testes dos estimadores, integridade dos agregados, lint e build. Não publica a proposta.'],
        ['Push em main / execução manual', 'Mesmas validações, criação do artefato estático e deployment no ambiente github-pages.'],
        ['Após o deployment', 'Consulta HTTP de HTML, JS, CSS, fontes e imports; compara SHA-256 de todos os arquivos públicos com o commit. Repetições curtas acomodam propagação.'],
        ['Permissões', 'Conteúdo somente leitura no build; pages:write e id-token:write apenas no deployment. Actions fixadas por SHA.'],
        ['Dados privados', 'CI não recebe microdados nem credenciais GCP. Analisa contratos e agregados já gerados e versionados.'],
    ], [128, 375])
    sub('Validações implementadas')
    p('10 testes científicos cobrem horizonte futuro sem a origem, semanas domingo-sábado, expurgo temporal, invariância de limiares e bins a mudanças no holdout, WOE/IV conhecidos, células zero, classe ausente, bin ausente, PSI, reamostragem por conglomerados e quantis ponderados. O verificador JavaScript recalcula os alvos e o Q80 a partir do painel exportado e as fórmulas de WOE/IV a partir das contagens dos bins.')
    p('Também são verificadas todas as somas e taxas, chaves de município-semana, colunas permitidas na exportação, hashes dos agregados, existência dos relatórios e integridade dos 26 arquivos originais do mapa. A navegação da prévia foi inspecionada em navegador: filtros, seções, seleção de variáveis e retorno ao mapa. O histórico do Actions abaixo é a evidência atual de publicação e da conferência HTTP.', 'SmallV')
    link('Consultar as execuções e o resultado do deployment', REPO + '/actions/workflows/pages.yml')
    p('Não foi criado agendamento para reconsultar a nuvem: os dados dependem de nova carga validada, e uma rotina agendada sem essa dependência poderia apenas republicar o mesmo snapshot. Push em main e execução manual cobrem a manutenção desta edição.', 'SmallV')

    heading('9. Reproduzir e revisar os próximos passos')
    sub('Reprodução dos agregados')
    p('O script build-article-analytics.py exige --raw-dir e --release-dir, verifica tamanho e MD5 dos 18 Parquets contra o manifesto validado e registra SHA-256 dos insumos. Nunca envia registros individuais para a saída pública. O ambiente analítico usa Python 3.11, pandas 3.0.5, NumPy 2.4.6 e PyArrow 25.0.1.')
    p('python scripts/build-article-analytics.py --raw-dir <diretorio-privado> --release-dir <diretorio-do-manifesto>\npython -m unittest discover -s scripts -p test_analytics.py -v\nnpm ci\nnpm run check\nnpm run lint\nnpm run build', 'CodeV')
    p('O relatório é gerado por build-article-report.py com ReportLab. method.json contém definições, fontes e hashes; analysis.json contém intervalos, contagens, IV/WOE, ICs e corte secundário. municipality-week.csv contém as 1.430 origens municipais e covariáveis agregadas. Completeness e ranking também têm CSV próprio.', 'SmallV')
    sub('Revisão sugerida para o artigo e a plataforma')
    for text in [
        '1. Confirmar se o artigo deve adotar a carga 2021-2026 ou se será criada uma extração com o histórico desde 2010. Não misturar denominadores dessas edições.',
        '2. Revisar a convenção de semana epidemiológica, sobretudo 2026, e o sinal/documentação do campo de atraso. Os achados deste relatório não alteram automaticamente a transformação original.',
        '3. Definir snapshots históricos CNES e completar a cobertura de clima, principalmente Manaus e Recife, antes de estudar rede e território como preditores temporais.',
        '4. Guardar extrações comparáveis para medir revisões em 30/60/90 dias e a disponibilidade real dos registros em cada origem de previsão.',
        '5. Revisar os critérios de bins, limiar Q80 e janelas com os autores. Se a avaliação 2025 for usada para escolher variáveis ou parâmetros, reservar um novo período intocado para validação futura.',
    ]: p(text, 'SmallV')
    sub('Proveniência')
    p('Execução Gold: ' + m['runId'], 'SmallV')
    p('SHA-256 do manuscrito: ' + m['paper']['sha256'], 'TinyV')
    p('Manifesto dos agregados: ' + hashlib.sha256((PUBLIC / 'manifest.json').read_bytes()).hexdigest(), 'TinyV')
    story.append(Spacer(1, 12))
    link('Método e hashes dos insumos', SITE + 'analytics/method.json')
    link('Código dos estimadores e protocolo de geração', REPO + '/tree/main/scripts')
    p('O manuscrito original, os microdados, identificadores individuais e credenciais não foram incluídos nesta publicação. Todas as conclusões se referem ao snapshot e ao protocolo explicitados aqui.', 'SmallV')

    pdfpath = OUT / 'VIGIAR_Relatorio_Metricas_Artigo.pdf'
    def page_footer(canvas, doc):
        canvas.saveState()
        width, height = A4
        canvas.setStrokeColor(border); canvas.setLineWidth(.5); canvas.line(46, 47, width - 46, 47)
        canvas.setFont('Arial', 7.5); canvas.setFillColor(muted)
        canvas.drawString(46, 32, 'VIGIAR | Métricas do manuscrito | Edição pública')
        canvas.drawRightString(width - 46, 32, str(doc.page))
        canvas.restoreState()
    doc = SimpleDocTemplate(str(pdfpath), pagesize=A4, rightMargin=46, leftMargin=46, topMargin=45, bottomMargin=65,
                            title='VIGIAR - Métricas do artigo e publicação', author='VIGIAR', subject='Relatório de implementação, qualidade e análise WOE/IV')
    doc.build(story, onFirstPage=page_footer, onLaterPages=page_footer)
    mdpath = deliver / 'VIGIAR_Relatorio_Metricas_Artigo.md'
    mdpath.write_text('\n'.join(md).rstrip() + '\n', encoding='utf8')
    shutil.copyfile(pdfpath, deliver / pdfpath.name)
    print(json.dumps({'pdf': str(pdfpath), 'publicPdf': str(deliver / pdfpath.name), 'markdown': str(mdpath), 'bytes': pdfpath.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    main()
