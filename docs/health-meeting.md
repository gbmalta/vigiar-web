# VIGIAR · Health Meeting

Versão alternativa em `/vigiar-web/health-meeting.html`, independente da entrada original do atlas. Preserva React, Vite, Leaflet, Recharts e as fontes locais. Três áreas: visão geral, predições e análise espacial. Seleção de cidade e semana compartilhada; layout responsivo; mapa com alternativa textual; tabela e CSV acessíveis.

## Executar e validar

```sh
npm ci
npm run check:meeting
npm run check
npm run lint
npm run build
npm run dev -- --port 4182 --strictPort
```

Abrir `http://127.0.0.1:4182/vigiar-web/health-meeting.html`.

A mesma workflow de GitHub Pages publica as duas entradas quando a alteração é integrada em `main`. Esta versão não redireciona o atlas existente. O pacote público novo contém apenas 520 agregados municipais de teste, CSV e manifesto. Não copiar `public/local-benchmarks`, modelos, dados individuais ou relatórios privados para publicação.

## Recorte científico

Rodada congelada `r20260913T164702_dbba0708`, de 13/09/2026, configuração de origem `v000044`, Poisson com histórico e clima. É a primeira configuração na seleção prévia das cinco versões de referência, não uma afirmação de melhor modelo atual. Seleção interna antes de 2024; pesos fixos durante teste; preditores atualizados causalmente. Os anos 2024–2025 já foram explorados: avaliação retrospectiva, sem alegação de teste prospectivo independente.

Unidade: todas as notificações por município de notificação. Horizonte: soma das quatro semanas seguintes. 104 semanas de referência × cinco cidades = 520 previsões. Última referência: 28/12/2025; origem: 03/01/2026; janela: 04–31/01/2026. Não há predição atual para setembro de 2026. Não foram fabricados intervalos de predição.

O mapa exibe pontos municipais e variação percentual frente às quatro semanas anteriores. Alta acima de +20%, queda abaixo de −20%, estável no intervalo inclusivo. Base zero não permite percentual. Esses limites são convenção de apresentação, não limiares epidemiológicos. Não há desagregação por bairro, normalização populacional, interpolação ou inferência de clusters espaciais. Notificações não são incidência nem pessoas únicas. Janelas sobrepostas não podem ser somadas como total anual.

MAE e WAPE calculados no navegador, com verificação independente contra os valores da rodada: MAE 667,813028689871; WAPE 40,49957255935438%. Redução do erro = 1 − erro absoluto do modelo / erro absoluto da persistência de quatro semanas; pode ser negativa. A interface arredonda os valores somente para apresentação.

`python scripts/export-health-meeting.py` regenera o pacote usando os artefatos locais, verifica hashes de origem e reconcilia o MAE antes de exportar. A workflow não precisa desses arquivos locais: verifica os agregados versionados.

## TypeSafe opcional

`npm run review:meeting` executa revisão semântica de afirmações editoriais com Choice, via HTTP API v1, usando `TYPESAFE_API_KEY` somente no ambiente do processo. Envia apenas definições e metadados agregados. Salva o resultado em `tmp/`, nunca no pacote público; inclui duas afirmações falsas como controles. Não altera textos ou números automaticamente e não confunde confiança semântica com incerteza epidemiológica. Não foi executado sem uma chave configurada.

Referências lidas: [API](https://docs.typesafe.ai/api), [Choice](https://docs.typesafe.ai/primitives/choice), [verificação de citações](https://docs.typesafe.ai/cookbooks/citation_check).
