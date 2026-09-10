# VIGIAR · Mapa histórico

[Abrir o mapa público](https://gbmalta.github.io/vigiar-web/)

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

Para usar outro nome de repositório ou domínio próprio, ajuste `base` em `vite.config.ts` e o link deste README.

## Atualização dos dados

O gerador `scripts/build-map-data.py` exige `--raw-dir`, `--release-dir` e `--reference-dir` para os Parquets, o manifesto da mesma carga e o cache do IBGE. Requer pandas, pyarrow e shapely. Use `--output public/data` e copie a evidência gerada `map_validation.json` para `docs/map-validation.json`. A opção `--reports-dir` deve apontar somente para relatórios revisados para publicação. Não versione os Parquets nem o cache bruto. Execute `npm run check` antes de publicar. Novas versões precisam atualizar as referências temporais e os textos correspondentes da interface.

`scripts/build-dag-diagram.py --release-dir <pasta-da-carga>` reproduz o SVG a partir do snapshot de código e das evidências arquivadas. Esses insumos precisam ser fornecidos pelo mantenedor; não fazem parte do site público. Os scripts de geração não são executados pela workflow do Pages.

Evidências de validação: `docs/map-validation.json`, `docs/data-checks.json` e `docs/dag-evidence.json`. `npm run check` confere os hashes SHA-256 dos dados contra o manifesto e reconcilia totais, séries e campos publicados. As fontes Geist e Geist Mono são distribuídas sob SIL Open Font License, incluída em `fonts/`.
