# Métricas do artigo e publicação do VIGIAR

Relatório de implementação, resultados e limitações

09/09/2026 23:27 (Brasília)

A área “Métricas do artigo” amplia o observatório público com qualidade dos dados, integração entre fontes, tempos de notificação e encerramento, um alvo futuro de quatro semanas e análise exploratória WOE/IV. O mapa, suas camadas e os relatórios anteriores continuam acessíveis.

[Abrir as métricas no site público](https://gbmalta.github.io/vigiar-web/#metricas)

[Repositório e histórico das publicações](https://github.com/gbmalta/vigiar-web)

| Resultado | Medida nesta edição |
|---|---|
| Carga analisada | 18 Parquets validados; 12.506.888 notificações representadas por 12.493.876 grupos SINAN Gold |
| Recorte territorial | 5 municípios de estudo, 1.961 UDHs e diagnóstico nacional de qualidade |
| Painel semanal | 1.430 origens completas de semana; 1.025 no desenvolvimento, 260 na avaliação 2025 e 20 no expurgo |
| Variáveis | 45 candidatas em 6 blocos; WOE, IV, PSI e intervalos por bootstrap de município-ano |
| Eventos na avaliação | 59 de 260 origens (22,69%), pelos limiares municipais fixados no desenvolvimento |
| Automação | Validação em pull requests; build, publicação e conferência HTTP por hashes em main |

### Decisão principal

Interpretei a referência ao artigo como um pedido para incorporar suas métricas de qualidade e sua análise WOE/IV ao site existente. Usei a carga local validada, sem executar nova extração na nuvem. Como o histórico disponível começa em 2021, adaptei o protocolo temporal e identifiquei a edição como exploratória, sem alegar reprodução dos números preliminares do manuscrito.

As decisões que mais merecem revisão são o histórico 2021-2024, a definição de semana domingo-sábado, o alvo relativo Q80 e a exclusão do cadastro CNES de 2026 dos preditores históricos.

## 1. Correspondência com o manuscrito

A multiscale dataset for dengue surveillance in Brazil: health facilities, UDH-level socioeconomic indicators, and WOE/IV analysis

Documento fornecido na conversa, com 14 páginas, tabelas em elaboração e figuras ainda indicadas como placeholders. O arquivo do manuscrito não foi publicado. Os valores abaixo são calculados da carga Gold, não copiados como resultados finais do artigo.

| Tema | Manuscrito | Implementação |
|---|---|---|
| Histórico de desenvolvimento | 2010-2024 | 2021-2024, com expurgo temporal. Não reproduz integralmente o artigo. |
| Avaliação 2025 | 255 município-semanas (51 × 5), com números preliminares | 260 município-semanas (52 × 5); semanas fixas e quatro semanas futuras observadas. |
| UDHs nos cinco municípios | Aproximadamente 1.250, sem Cuiabá na descrição | 1.961: Rio 1.136; Porto Alegre 335; Manaus 200; Recife 194; Cuiabá 96. |
| CNES | Série histórica de estabelecimentos | Um snapshot de julho de 2026: 631.973 linhas. Não usado como preditor histórico. |
| Dimensão de municípios | Uma linha por município | 27.748 linhas / 5.565 códigos; chave composta inclui ano, UDH e recortes sociodemográficos. Repetir apenas o código não é duplicação da chave completa. |
| Volume SINAN | 34,7 milhões / 151 colunas no escopo amplo | 12,493,876 grupos / 141 colunas; Σqt = 12,506,888 notificações, 2021-junho/2026. Não somar fat_notificacoes a fat_sinan. |

### Métricas efetivamente adicionadas

Completude por fonte/campo; unicidade nas chaves declaradas; plausibilidade de datas e clima; consistência de calendário e agregados; integridade referencial; cobertura de coordenadas e UDHs; funil cumulativo de junções; quantis de atraso; prevalência do alvo; WOE por faixa; IV com IC de 95%; estabilidade entre períodos e cidades; PSI e análise secundária em 2024-2025.

Métricas sem dados suficientes são exibidas como indisponíveis: revisão em 30/60/90 dias, ganhos Bronze-Silver-Gold, latência de disponibilização, recuperação por geocodificação e capacidade histórica da rede CNES. Não se atribui zero a medições inexistentes.

## 2. Qualidade: denominadores e achados

| Dimensão | O que foi medido / limite |
|---|---|
| Completude | 1 - nulos/linhas físicas Gold, por campo. Não equivale a validade semântica ou presença de informação aplicável. |
| Conformidade | Tipos Gold, datas dentro do intervalo e chaves reconhecidas; máscaras e códigos brutos não disponíveis. |
| Plausibilidade | Ordem de datas, sinais dos atrasos, chuva e vento não negativos, umidade 0-100 e ordem de temperaturas. |
| Unicidade | Chaves de dimensões, AVS e clima. Não há chave individual para deduplicar pessoas no SINAN. |
| Consistência | Somas anuais reproduzem exatamente o mapa; semana dos sintomas comparada à dimensão; sinal do atraso legado auditado. |
| Oportunidade | Quantis ponderados por qt; sintomas-notificação e encerramento reconstruído; não encerrados separados. |
| Estabilidade de revisão | Não mensurável com um único snapshot. Fórmula e necessidade de novas extrações documentadas. |
| Validade espacial | Coordenadas numéricas e limites geográficos; vínculos à UDH da ponte existente. Não prova endereço correto. |
| Integridade referencial | Correspondências / chaves presentes; presença da chave informada separadamente. |
| Prontidão analítica | Funil de enriquecimento por notificações; painel analítico separado, mantendo covariáveis ausentes. |

### Pontos que exigem atenção na plataforma de dados

O campo legado de atraso coincide com sintomas - notificação em 12.506.818 pares. Em 11.158.414 deles o sinal difere do intervalo notificação - sintomas. A correção foi aplicada apenas ao cálculo do site; os Parquets e o pipeline original não foram alterados.

A numeração da semana dos sintomas diverge da dimensão em 404.944 notificações elegíveis (3,24%). São 403.671 em notificações de 2026 e 1.266 em 2025, além de 7 em 2022-2024. A dimensão usa semana ISO após deslocar a data em um dia; convém revisar a convenção de ano/semana antes de alterar registros. O painel novo une por datas, evitando depender desse número.

Data de nascimento está ausente em todas as linhas do snapshot; sua plausibilidade é “não estimada”. Não se interpreta o denominador zero como aprovação da regra.

## 3. Tempos de notificação e encerramento

Todas as distribuições abaixo são ponderadas por qt. Os quantis usam a inversa da distribuição empírica apenas para intervalos não negativos; ausentes e negativos aparecem separadamente. Dias extremos não foram truncados.

| Recorte | Mediana sintomas → notificação | Q25 / Q75 | P90 / P95 | Não encerrados |
|---|---|---|---|---|
| Brasil | 3 | 1 / 5 | 8 / 12 | 277.096 (2,22%) |
| 2021 | 3 | 1 / 6 | 9 / 14 | 8.617 (0,85%) |
| 2022 | 3 | 1 / 5 | 8 / 14 | 8.834 (0,63%) |
| 2023 | 3 | 1 / 4 | 7 / 11 | 11.427 (0,76%) |
| 2024 | 3 | 1 / 4 | 7 / 12 | 94.244 (1,46%) |
| 2025 | 3 | 1 / 4 | 7 / 10 | 69.754 (4,06%) |
| 2026 | 3 | 1 / 5 | 8 / 12 | 84.220 (20,76%) |

### Brasil: sintomas até notificação

Mediana de 3 dias, intervalo interquartil 1-5, P90 de 8 e P95 de 12. Há 12.506.812 intervalos não negativos, 70 ausentes e 6 negativos. Máximo observado: 469 dias.

### Brasil: notificação até encerramento, reconstruído

Mediana de 20 dias, intervalo interquartil 7-56, P90 de 61 e P95 de 90. São 12.229.683 intervalos não negativos e 95 negativos. 277.110 notificações não possuem intervalo reconstruível.

A duração Gold de encerramento começa no início dos sintomas, ou na notificação quando sintomas estão ausentes. Para obter o intervalo pedido no artigo, subtrai-se notificação - sintomas. A fonte já descarta encerramentos anteriores ao início dos sintomas. Não há data bruta de encerramento para validação independente; esta limitação acompanha todos os resultados.

O indicador de não encerramento usa a flag, não a disponibilidade da duração. São 277.096 notificações não encerradas (2,22%) no snapshot. Em 2026 o percentual é maior também por se tratar de um período recente e parcial; não se conclui piora operacional apenas dessa comparação.

## 4. Integração e cobertura espacial

O funil usa notificações nos cinco municípios, sempre ponderadas por qt. Cada etapa restringe a anterior. Vínculos CNES de 07/2026 e AVS 2010 são diagnósticos retrospectivos.

| Etapa cumulativa | Notificações | Retenção | Perda na etapa |
|---|---|---|---|
| Notificações nos cinco municípios | 302.467 | 100,00% | 0 |
| Data válida | 302.467 | 100,00% | 0 |
| Município reconciliado | 302.467 | 100,00% | 0 |
| CNES no cadastro de 07/2026 | 301.132 | 99,56% | 1.335 |
| CNES com UDH no mesmo município | 285.997 | 94,55% | 15.135 |
| UDH com AVS 2010 | 285.997 | 94,55% | 0 |
| Semana municipal com registro de clima | 234.451 | 77,51% | 51.546 |
| Horizonte futuro completo | 234.451 | 77,51% | 0 |
| Origem nos períodos de análise, após expurgo | 232.007 | 76,70% | 2.444 |

| Município | CNES | Coords. nos limites¹ | Com UDH | UDHs |
|---|---|---|---|---|
| Rio de Janeiro | 29.359 | 24.439 | 22.377 | 1.136 |
| Porto Alegre | 9.808 | 9.716 | 9.697 | 335 |
| Manaus | 2.648 | 2.327 | 2.310 | 200 |
| Recife | 4.670 | 3.246 | 3.004 | 194 |
| Cuiabá | 2.779 | 2.640 | 2.592 | 96 |

¹ Caixa geográfica do Brasil: latitude -34 a 6; longitude -74 a -28. Há 49.264 estabelecimentos nos cinco municípios, 42.370 com pares de coordenadas numéricas, 42.368 dentro dos limites e 39.980 associados a UDH. Dois pares numéricos estão fora dos limites. Nenhuma geocodificação adicional foi executada.

O funil termina em 232.007 notificações enriquecidas (76,70% do início). Isso não é a amostra de WOE/IV: o painel usa todas as semanas elegíveis, preserva o total municipal e inclui a ausência de clima como categoria. Há linha de clima em 2025 para Rio, Porto Alegre e Cuiabá; Manaus e Recife não possuem esse vínculo nesta carga.

## 5. Alvo futuro e separação temporal

Unidade: município de notificação por semana de domingo a sábado. A origem t é o fim da semana, quando se consideram conhecidos os registros até t. Não se interpreta o município como local de residência ou de infecção.

B(u,t) = y(u,t+1) + y(u,t+2) + y(u,t+3) + y(u,t+4)
Evento = 1 quando B(u,t) ≥ Q80 de B no desenvolvimento do município.

| Partição | Origens semanais | Município-semanas |
|---|---|---|
| Desenvolvimento | 03/01/2021 a 01/12/2024 | 1.025 (205 por cidade) |
| Expurgo | 08, 15, 22 e 29/12/2024 | 20 (4 por cidade) |
| Avaliação principal | 05/01/2025 a 28/12/2025 | 260 (52 por cidade) |
| Fora da avaliação / horizonte incompleto | Demais origens de 2026 | 125; 20 sem as quatro semanas futuras |

| Município | Limiar Q80 | Eventos dev. | Eventos 2025 | Taxa 2025 |
|---|---|---|---|---|
| Rio de Janeiro | 2.436,2 | 41/205 | 0/52 | 0,00% |
| Porto Alegre | 774,2 | 41/205 | 34/52 | 65,38% |
| Manaus | 304,2 | 41/205 | 0/52 | 0,00% |
| Recife | 602,2 | 41/205 | 18/52 | 34,62% |
| Cuiabá | 162,4 | 41/205 | 7/52 | 13,46% |

59 de 260 origens de avaliação atingem o limiar (22,69%). Rio e Manaus não têm eventos em 2025 sob essa definição, portanto seu IV de avaliação local fica indisponível. Empates no limiar contam como evento; 20% no desenvolvimento não é uma prevalência garantida para qualquer base.

A carga de notificações termina em 29/06/2026; a última semana completa termina em 27/06/2026. As quatro últimas origens têm rótulo ausente. A avaliação de dezembro/2025 usa notificações de janeiro/2026. Semanas sem linhas significam zero registros na extração, sob hipótese de completude, e não ausência de transmissão.

Não há snapshots “as of” para reproduzir o que se sabia na data original. Datas e defasagens evitam usar semanas futuras nos preditores, mas não eliminam revisão retrospectiva ou atraso de chegada à fonte. O alvo é carga relativa de notificações, não uma definição de surto.

## 6. WOE, IV e incerteza

Até cinco intervalos por quantis do desenvolvimento; limites comuns às cinco cidades. Vizinhos com menos de 5% da amostra ou menos de cinco exemplos de alguma classe são mesclados. Ausentes têm categoria separada. Limites, regra de suavização e limiares são congelados para a avaliação.

p(j,c) = [n(j,c) + 0,5] / [N(c) + 0,5 × J]
WOE(j) = ln[p(j,0) / p(j,1)]
IV = soma de [p(j,0) - p(j,1)] × WOE(j)

J inclui a categoria ausente reservada, mesmo quando não observada. WOE positivo favorece não-eventos e negativo favorece eventos. Sem ambas as classes, ou sem variação utilizável, o IV não é estimado.

| Variável (ordem pelo desenvolvimento) | IV dev. | IV 2025 | PSI |
|---|---|---|---|
| Notificações na semana de origem | 2,4712 | 3,3054 | 0,1789 |
| Média nas últimas 4 semanas | 2,2063 | 2,5680 | 0,1944 |
| Soma nas últimas 4 semanas | 2,2063 | 2,5680 | 0,1944 |
| Máximo nas últimas 4 semanas | 2,1543 | 3,1214 | 0,1848 |
| Notificações: defasagem de 1 semana(s) | 2,1432 | 2,5971 | 0,1802 |
| CNES notificantes ativos | 2,0393 | 2,0294 | 0,2686 |
| Desvio padrão nas últimas 8 semanas | 2,0357 | 2,3033 | 0,1845 |
| Máximo nas últimas 8 semanas | 1,9440 | 2,4496 | 0,2292 |
| Desvio padrão nas últimas 4 semanas | 1,8759 | 1,9014 | 0,1131 |
| Notificações: defasagem de 2 semana(s) | 1,7617 | 1,9488 | 0,1989 |

### Intervalos e interpretação

Para 'Notificações na semana de origem', IV dev. = 2,4712, IC 95% [1,693; 3,732]. Em 2025, IV = 3,3054, IC [1,153; 6,462]. O histórico recente domina este ranking, resultado esperado para um alvo construído a partir das notificações futuras, sem provar previsão útil em tempo real.

ICs: 500 reamostragens de conglomerados município-ano, sementes 20260909 + índice da variável; percentis 2,5 e 97,5. Bins e limiares ficam fixos, portanto o IC é condicional a essas escolhas. São 20 conglomerados no desenvolvimento e apenas 5 na avaliação. Réplicas sem as duas classes são descartadas e contadas; a variável líder tem 497 réplicas válidas em 2025.

A WOE de 2025 é recalculada com rótulos de avaliação somente para diagnóstico. Não é uma codificação ajustada para previsão de 2025. PSI mede mudança de distribuição; não é qualidade de classificação. Não se usam faixas universais de IV nem se somam IVs de variáveis correlacionadas.

## 7. Blocos, sensibilidade e variáveis estáticas

| Bloco | N | IV mediano dev. | IV máximo dev. | IV mediano 2025 |
|---|---|---|---|---|
| Histórico | 15 | 1,8759 | 2,4712 | 1,9488 |
| Dinâmica | 5 | 1,0214 | 1,5589 | 0,8353 |
| Clima | 12 | 0,1043 | 0,2966 | 0,2378 |
| Rede notificante | 3 | 1,0267 | 2,0393 | 1,2240 |
| Socioeconômico / território | 8 | 0,0025 | 0,0025 | 2,7141 |
| Calendário | 2 | 0,7536 | 1,4091 | 0,0413 |

### O que cada bloco representa

Histórico: contagem em t, defasagens de 1, 2, 4, 8, 13 e 52 semanas, média/soma/desvio/máximo em 4 e 8 semanas. Dinâmica: diferenças, crescimento regularizado, aceleração e contraste com 52 semanas atrás. Clima: chuva, temperatura, umidade e vento em t, lag 4 e média de 4 semanas.

Rede notificante: número de CNES ativos nos registros da semana, HHI e participação do maior notificante. Isso mede atividade de reporte, não capacidade de atendimento. Socioeconômico/território: médias e intervalos interquartis de IVS, IDHM, renda e saneamento nas UDHs, sem pesos populacionais, todos de 2010. Calendário: seno e cosseno anual.

### Corte secundário 2024-2025

Desenvolvimento até 03/12/2023 (765 origens), expurgo de quatro semanas e avaliação de 07/01/2024 a 28/12/2025 (520 origens). Limiares e bins são reajustados apenas no novo desenvolvimento. Para a variável líder da análise principal, o IV é 2,7595 no desenvolvimento e 2,7566 na avaliação secundária. Não se estimou IC secundário.

### Restrições relevantes

Variáveis AVS têm apenas cinco valores municipais estáticos: a associação agrupada pode refletir diferenças entre cidades, e não efeito causal ou capacidade de antecipar mudanças dentro de uma cidade. IV local de variável constante fica indisponível. A categoria de clima ausente também pode identificar a cidade; seus resultados exigem essa leitura.

Os preditores não usam óbito, classificação final, encerramento nem o target legado. O cadastro CNES/UDH de 2026 não foi retroativamente introduzido nos preditores. A heterogeneidade territorial de casos por UDH e a capacidade histórica da rede permanecem pendentes de dados temporais compatíveis.

## 8. Publicação, testes e manutenção

A aplicação continua estática em React + Vite, hospedada no GitHub Pages público. O novo módulo é carregado pela rota #metricas. Gráficos possuem tabelas equivalentes, filtros por cidade/ano/bloco e downloads de agregados. O mapa mantém o caminho original e passa a oferecer um link para as métricas.

| Etapa | Verificação configurada |
|---|---|
| Pull request | Instalação pelo lockfile, testes dos estimadores, integridade dos agregados, lint e build. Não publica a proposta. |
| Push em main / execução manual | Mesmas validações, criação do artefato estático e deployment no ambiente github-pages. |
| Após o deployment | Consulta HTTP de HTML, JS, CSS, fontes e imports; compara SHA-256 de todos os arquivos públicos com o commit. Repetições curtas acomodam propagação. |
| Permissões | Conteúdo somente leitura no build; pages:write e id-token:write apenas no deployment. Actions fixadas por SHA. |
| Dados privados | CI não recebe microdados nem credenciais GCP. Analisa contratos e agregados já gerados e versionados. |

### Validações implementadas

10 testes científicos cobrem horizonte futuro sem a origem, semanas domingo-sábado, expurgo temporal, invariância de limiares e bins a mudanças no holdout, WOE/IV conhecidos, células zero, classe ausente, bin ausente, PSI, reamostragem por conglomerados e quantis ponderados. O verificador JavaScript recalcula os alvos e o Q80 a partir do painel exportado e as fórmulas de WOE/IV a partir das contagens dos bins.

Também são verificadas todas as somas e taxas, chaves de município-semana, colunas permitidas na exportação, hashes dos agregados, existência dos relatórios e integridade dos 26 arquivos originais do mapa. A navegação da prévia foi inspecionada em navegador: filtros, seções, seleção de variáveis e retorno ao mapa. O histórico do Actions abaixo é a evidência atual de publicação e da conferência HTTP.

[Consultar as execuções e o resultado do deployment](https://github.com/gbmalta/vigiar-web/actions/workflows/pages.yml)

Não foi criado agendamento para reconsultar a nuvem: os dados dependem de nova carga validada, e uma rotina agendada sem essa dependência poderia apenas republicar o mesmo snapshot. Push em main e execução manual cobrem a manutenção desta edição.

## 9. Reproduzir e revisar os próximos passos

### Reprodução dos agregados

O script build-article-analytics.py exige --raw-dir e --release-dir, verifica tamanho e MD5 dos 18 Parquets contra o manifesto validado e registra SHA-256 dos insumos. Nunca envia registros individuais para a saída pública. O ambiente analítico usa Python 3.11, pandas 3.0.5, NumPy 2.4.6 e PyArrow 25.0.1.

python scripts/build-article-analytics.py --raw-dir <diretorio-privado> --release-dir <diretorio-do-manifesto>
python -m unittest discover -s scripts -p test_analytics.py -v
npm ci
npm run check
npm run lint
npm run build

O relatório é gerado por build-article-report.py com ReportLab. method.json contém definições, fontes e hashes; analysis.json contém intervalos, contagens, IV/WOE, ICs e corte secundário. municipality-week.csv contém as 1.430 origens municipais e covariáveis agregadas. Completeness e ranking também têm CSV próprio.

### Revisão sugerida para o artigo e a plataforma

1. Confirmar se o artigo deve adotar a carga 2021-2026 ou se será criada uma extração com o histórico desde 2010. Não misturar denominadores dessas edições.

2. Revisar a convenção de semana epidemiológica, sobretudo 2026, e o sinal/documentação do campo de atraso. Os achados deste relatório não alteram automaticamente a transformação original.

3. Definir snapshots históricos CNES e completar a cobertura de clima, principalmente Manaus e Recife, antes de estudar rede e território como preditores temporais.

4. Guardar extrações comparáveis para medir revisões em 30/60/90 dias e a disponibilidade real dos registros em cada origem de previsão.

5. Revisar os critérios de bins, limiar Q80 e janelas com os autores. Se a avaliação 2025 for usada para escolher variáveis ou parâmetros, reservar um novo período intocado para validação futura.

### Proveniência

Execução Gold: publish_2021_2026_20260909T0220Z

SHA-256 do manuscrito: ef35180975a0b752aefcb49a829ca6d1aa96e6064535f4dacc54d2fe9fa4c3d1

Manifesto dos agregados: 2264bf87be1e0dd9b75ac48137426cb15089730456fdaa83eca11b3d836e1c8e

[Método e hashes dos insumos](https://gbmalta.github.io/vigiar-web/analytics/method.json)

[Código dos estimadores e protocolo de geração](https://github.com/gbmalta/vigiar-web/tree/main/scripts)

O manuscrito original, os microdados, identificadores individuais e credenciais não foram incluídos nesta publicação. Todas as conclusões se referem ao snapshot e ao protocolo explicitados aqui.
