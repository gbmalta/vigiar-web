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

## Histórico dinâmico e regiões

O mapa exibe minigráficos de previsto (turquesa tracejado) e observado (cinza), com as últimas 26 semanas de referência disponíveis até a semana escolhida. As duas linhas usam a mesma escala iniciada em zero dentro de cada gráfico; a escala é própria por cidade e recorte, apropriada à leitura de tendências, não à comparação direta de alturas entre cidades. Os cartões têm conectores às coordenadas municipais e posicionamento para evitar sobreposição. Podem ser ocultados.

O controle temporal sincroniza cartões, indicadores e detalhes. Reproduzir avança uma semana a cada 1,2 segundo; inicia no começo quando acionado no final; para ao terminar, ao manipular a barra, ao sair da aba ou ao ocultar a página. É reprodução retrospectiva, não atualização ao vivo. Mudanças de semana não reposicionam a câmera nem alteram os atributos regionais.

Clicar no ponto, no minigráfico, na lista ou no seletor da cidade aproxima o mapa e carrega seu GeoJSON público. O botão Todas as cidades retorna à visão nacional. Estão disponíveis 1.961 UDHs (200 Manaus, 194 Recife, 1.136 Rio de Janeiro, 335 Porto Alegre, 96 Cuiabá). A busca por nome/código e a lista oferecem alternativa ao clique no polígono. O detalhe mostra IVS, IDHM, renda per capita (referência 2010) e estabelecimentos CNES vinculados (jul/2026); a coloração troca entre essas quatro variáveis. Ausência é distinta de zero.

UDHs não equivalem necessariamente a bairros. Os valores regionais são fotografias estáticas e não predições de dengue. Não há série prevista ou observada por UDH nesta versão. Os arquivos `public/data/udh-*.geojson` são os mesmos agregados já publicados no atlas, com hashes validados por `npm run check`; não houve nova extração nem rateio das previsões municipais.

## Restauração e ficha técnica

“Restaurar visualização” mantém a aba atual e retorna à última semana, Rio de
Janeiro como cidade de referência e visão nacional do mapa. Reativa observado
e minigráficos, oculta a persistência, limpa a busca/seleção regional, restaura
a variável territorial padrão e interrompe a reprodução temporal. Uma mensagem
acessível confirma a ação.

A aba “Modelo e experimentos” apresenta a formulação Poisson com offset,
18 atributos, transformações, parâmetros, três divisões temporais internas,
cinco configurações avaliadas e três referências. Os detalhes são expansíveis.
Os anos já explorados são identificados como avaliação retrospectiva; as
variáveis territoriais do mapa não são apresentadas como entradas do modelo.

`python scripts/export-model-details.py` exporta apenas metadados permitidos
dos artefatos congelados, conferindo seus SHA-256. Não carrega modelos binários
nem dados individuais e não executa experimentos. O arquivo público
`health-meeting/model-details.json` inclui a proveniência. A verificação
`npm run check:meeting` reconcilia a ficha com as predições publicadas e checa
as fronteiras temporais de treino e validação.

## Simulador com o modelo congelado

A aba técnica inclui inferência real da v44 no navegador. Município e semana
selecionam o histórico de 2024–2025; as notificações da semana de referência e
temperatura média/precipitação acumulada da semana anterior são editáveis.
Uma seção expansível permite alterar as 53 semanas de notificações e as oito
de clima, incluindo o valor de 52 semanas atrás. As 18 variáveis são calculadas
automaticamente, com as mesmas transformações, parâmetros de pré-processamento,
coeficientes, intercepto, limiares municipais e intensidade do modelo preservado.
Não há ajuste, aproximação por outro modelo, consulta de previsões pré-calculadas
para gerar cenários, nem envio das entradas a um servidor.

O gráfico apresenta totais históricos móveis de quatro semanas e um único total
previsto nas quatro semanas seguintes. Não distribui a saída em previsões
semanais. Edições são cenários exploratórios, não efeitos causais nem previsões
operacionais atuais. A seleção de outra cidade/data reinicia o histórico.
Ausência climática segue a imputação do treino; notificações vazias, fracionárias
ou negativas interrompem o cálculo. Datas sem histórico disponível não são oferecidas.

`scripts/export-inference.py` verifica os hashes do artefato `model.joblib`, do
dataset agregado e do código congelado antes de carregar o modelo local.
Publica somente parâmetros numéricos e três campos semanais agregados por
município (notificações, temperatura, precipitação) em `inference.json`.
O binário e as fontes individuais não são publicados. A exportação opcional usa
`scripts/requirements-inference.txt`; `.inference-tools/` é um ambiente local
ignorado pelo Git. Não requer nem executa treino no repositório de pesquisa.

A paridade cobre as 520 previsões salvas e 15 cenários editados calculados pelo
estimador scikit-learn original, incluindo zeros e clima ausente. A maior
diferença nas previsões históricas é 0,000012524 notificação, decorrente do
arredondamento independente dos CSVs semanais e das features em dez algarismos
significativos. Os testes JavaScript rodam em `npm run check:meeting`, inclusive
no CI. A ficha registra proveniência e erro máximo da exportação.

## TypeSafe opcional

`npm run review:meeting` executa revisão semântica de afirmações editoriais com Choice, via HTTP API v1, usando `TYPESAFE_API_KEY` somente no ambiente do processo. Envia apenas definições e metadados agregados. Salva o resultado em `tmp/`, nunca no pacote público; inclui duas afirmações falsas como controles. Não altera textos ou números automaticamente e não confunde confiança semântica com incerteza epidemiológica. Não foi executado sem uma chave configurada.

Referências lidas: [API](https://docs.typesafe.ai/api), [Choice](https://docs.typesafe.ai/primitives/choice), [verificação de citações](https://docs.typesafe.ai/cookbooks/citation_check).

## Identidade visual

A edição Health Meeting usa os logos originais fornecidos pelo projeto, em
`public/health-meeting/brand/`, preservando cores, transparência e proporções.
A identidade usa o azul `#053A81` e o turquesa `#1EAF9D` extraídos do logo MLab.
O turquesa escuro `#087F73` dá contraste aos controles e às séries previstas.
As cores de tendência e das escalas regionais continuam com seu significado
analítico. O cabeçalho adapta os logos MLab, UFRGS e CIARS para desktop e celular.

## Texto da interface

Usar títulos descritivos de conteúdo e função (vigilância epidemiológica,
leitura territorial, predições, indicadores e métricas). Evitar slogans,
metáforas e chamadas promocionais. Manter unidades, datas, instruções de
interação e limitações necessárias à interpretação dos dados.

## Composição institucional do cabeçalho

MLab, UFRGS e CIARS compartilham uma faixa com alinhamento vertical central e
larguras ajustadas ao formato de cada marca. As imagens mantêm as proporções,
cores e conteúdo originais. No celular, as três marcas continuam lado a lado;
o nome do VIGIAR fica abaixo e os controles do evento ocupam uma faixa própria.
Verificação visual em desktop e larguras de 820, 390 e 320 pixels.

## Apresentação das métricas

Os indicadores usam uma faixa tipográfica contínua, com destaque proporcional
para o total previsto e separadores finos entre medidas secundárias. Não há
cartões individuais, fundos coloridos nem ícones decorativos nas métricas.
No celular, a medida principal ocupa a primeira linha e as secundárias ficam
lado a lado. O resumo municipal no mapa usa valores alinhados, e os indicadores
das UDHs usam uma grade de duas colunas com unidades e datas preservadas.
A comparação de municípios mantém os botões e destaca a seleção por uma linha.
