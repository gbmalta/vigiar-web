# VIGIAR · Mapa histórico

[Health Meeting · versão simplificada](https://gbmalta.github.io/vigiar-web/health-meeting.html)

A edição do Health Meeting tem visão geral, predições de quatro semanas e mapa
municipal para as cinco cidades do estudo. Usa 520 previsões retrospectivas de
2024–2025; não apresenta alertas atuais. Consulte
[`docs/health-meeting.md`](docs/health-meeting.md) para o recorte, execução local e
revisão editorial opcional com TypeSafe. O atlas original permanece nesta entrada.

[Abrir o mapa público](https://gbmalta.github.io/vigiar-web/)

[Métricas do artigo](https://gbmalta.github.io/vigiar-web/#metricas) · [Relatório da implementação](https://gbmalta.github.io/vigiar-web/research/VIGIAR_Relatorio_Metricas_Artigo.pdf)

Explore os dados de 2021 a 2026 por município, no celular ou computador. O painel reúne notificações SINAN, temperatura, precipitação, estabelecimentos CNES e vulnerabilidade por UDH, além do diagrama da DAG e dos relatórios da carga histórica.

## Dados e interpretação

Versão dos dados: `publish_2021_2026_20260909T0220Z`, validada em 09/09/2026.

- 5.570 municípios na referência cartográfica e 12.506.888 notificações reconciliadas. São somas de `qt` por ano-calendário da data de notificação, sem filtro de confirmação; não são pacientes únicos nem taxas de incidência.
- 18 registros de Boa Esperança do Norte em 2026 entram no total nacional, mas não são posicionados no mapa por ausência de geometria na referência disponível.
- 2026 é parcial: SINAN até 29/06 e clima até 28/02. No clima, 2024 vai até 30/11, os anos são epidemiológicos e a cobertura varia por município.
- CNES: julho/2026. IVS/IDHM: 2010. As 1.961 UDHs abrangem Rio de Janeiro, Porto Alegre, Manaus, Recife e Cuiabá.
- Notificações são posicionadas em um ponto representativo do município. Somente estabelecimentos CNES possuem coordenadas individuais. A amostragem de pontos em telas densas é indicada no mapa.

Os arquivos públicos contêm agregados municipais e atributos selecionados de estabelecimentos e áreas. Não incluem registros de pacientes, CPF, contatos ou credenciais. As bases completas permanecem na GCP com suas permissões originais.

O mapa corresponde a uma carga histórica, sem atualização em tempo real. A DAG exibida foi reconstruída das evidências da execução: não é um monitor do Airflow. Os relatórios públicos preservam resultados e metodologia; passagens sobre a conta de faturamento foram retiradas das cópias públicas.

## Arquitetura

GCP/Parquet validado → pré-agregação Python → JSON/GeoJSON versionados → GitHub Pages → React/Leaflet/Recharts no navegador.

A navegação não consulta o BigQuery nem liga a VM do Airflow. Os dados, PDFs e fontes são servidos com a aplicação. O mapa de fundo utiliza tiles OpenStreetMap com atribuição; a referência municipal é a API do IBGE, consultada em 09/09/2026.

O app deriva do `vigiar-mapa`, adaptado de Sites/Vinext para Vite estático. Todos os caminhos de dados e relatórios respeitam `/vigiar-web/`. O CSS e os componentes de interação do mapa foram reaproveitados.

## Métricas do manuscrito

A rota `#metricas` contém qualidade e integração, distribuição de atrasos, alvo de quatro semanas, ranking WOE/IV, estabilidade temporal/geográfica, PSI, análise secundária e metodologia. O módulo e seus agregados são carregados ao abrir essa área.

- 45 variáveis, 1.430 município-semanas de 2021 a junho/2026. Desenvolvimento: 1.025 origens; avaliação 2025: 260 origens e 59 eventos; expurgo: 20 origens.
- O alvo soma **t+1 a t+4**, por município de notificação. Evento significa atingir o Q80 municipal ajustado no desenvolvimento; não define surto nem constitui previsão clínica.
- Bins comuns, mínimo de 5% e de cinco exemplos por classe, categoria ausente separada e suavização 0,5. Bootstrap de município-ano com 500 réplicas; ICs condicionais aos bins/limiares. Apenas cinco conglomerados na avaliação limitam a incerteza estimada.
- Esta é uma adaptação ao histórico disponível **2021–2024**, não reprodução integral do desenvolvimento 2010–2024 descrito no manuscrito. Os números preliminares do artigo não são usados como resultados medidos.
- Ausências de clima de Manaus/Recife, snapshot CNES 07/2026 e AVS 2010 estão explícitos. CNES atual não entra como preditor histórico. O funil de enriquecimento e a amostra de WOE/IV têm denominadores diferentes.
- O atraso sintomas-notificação foi recalculado das datas; o campo legado tem sinal contrário. A numeração de semana da fonte diverge do calendário sobretudo em 2026; junções novas usam a data do domingo. A transformação original não foi alterada.

Dados públicos e definições: `public/analytics/`. Relatório em PDF/Markdown: `public/research/`. O manuscrito original e os microdados não são publicados. Cada CSV contém apenas agregados ou metadados.

## Desenvolvimento e publicação

Node.js 22.13 ou mais recente e npm:

```sh
npm ci
npm run dev
npm run check
npm run lint
npm run build
npm run preview
node scripts/verify-deployment.mjs http://127.0.0.1:4173/vigiar-web/
```

Abra o endereço local com `/vigiar-web/`. A workflow `.github/workflows/pages.yml` verifica os dados, o código e o build antes de publicar cada atualização de `main`. Também pode ser executada manualmente em Actions. Os dados só mudam quando uma nova carga validada é incorporada ao repositório.

Pull requests executam as validações sem publicar. A workflow também roda dez testes científicos em Python 3.11 e confere fórmulas, denominadores e hashes dos agregados. Após o deployment, `scripts/verify-live.mjs` valida o site por HTTP, incluindo hashes de todos os arquivos públicos. As actions são fixadas por SHA e as permissões de publicação ficam no job de deployment. Não há extração GCP agendada por esta workflow.

Para usar outro nome de repositório ou domínio próprio, ajuste `base` em `vite.config.ts` e o link deste README.

## Atualização dos dados

O gerador `scripts/build-map-data.py` exige `--raw-dir`, `--release-dir` e `--reference-dir` para os Parquets, o manifesto da mesma carga e o cache do IBGE. Requer pandas, pyarrow e shapely. Use `--output public/data` e copie a evidência gerada `map_validation.json` para `docs/map-validation.json`. A opção `--reports-dir` deve apontar somente para relatórios revisados para publicação. Não versione os Parquets nem o cache bruto. Execute `npm run check` antes de publicar. Novas versões precisam atualizar as referências temporais e os textos correspondentes da interface.

`scripts/build-dag-diagram.py --release-dir <pasta-da-carga>` reproduz o SVG a partir do snapshot de código e das evidências arquivadas. Esses insumos precisam ser fornecidos pelo mantenedor; não fazem parte do site público. Os scripts de geração não são executados pela workflow do Pages.

Evidências de validação: `docs/map-validation.json`, `docs/data-checks.json` e `docs/dag-evidence.json`. `npm run check` confere os hashes SHA-256 dos dados contra o manifesto e reconcilia totais, séries e campos publicados. As fontes Geist e Geist Mono são distribuídas sob SIL Open Font License, incluída em `fonts/`.

Para regenerar as métricas do artigo a partir da mesma carga privada:

```sh
python -m pip install -r scripts/requirements-analytics.txt
python scripts/build-article-analytics.py --raw-dir <parquets-privados> --release-dir <manifesto-validado>
python -m unittest discover -s scripts -p test_analytics.py -v
```

`build-article-analytics.py` verifica os 18 insumos antes do cálculo e grava hashes em `public/analytics/manifest.json`. `build-article-report.py` gera PDF e Markdown com os resultados medidos; requer ReportLab e a família Arial (`--font-dir`). Após regenerar, revise o relatório, confira sua renderização e execute `npm run check`, `npm run lint` e `npm run build`. Mudanças de snapshot ou protocolo exigem revisar as contagens de referência em `verify-analytics.mjs`; não basta atualizar hashes automaticamente.
