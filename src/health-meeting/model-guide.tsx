import details from '../../public/health-meeting/model-details.json';
import { assetUrl } from '@/lib/asset-url';
import { date } from './data';

const decimal = (v: number) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const pct = (v: number) => `${decimal(v * 100)}%`;
const groups = [
  {
    title: 'Histórico de notificações',
    count: 8,
    names: details.features.slice(0, 8),
    description:
      'log(1 + N[t−k]), com k = 0, 1, 2, 3, 4, 8, 12 e 52 semanas. O lag 0 usa a semana já encerrada.',
  },
  {
    title: 'Médias móveis',
    count: 3,
    names: details.features.slice(8, 11),
    description:
      'log(1 + média das últimas 4, 8 ou 13 semanas), incluindo a semana t.',
  },
  {
    title: 'Sazonalidade',
    count: 2,
    names: details.features.slice(11, 13),
    description:
      'Seno e cosseno do dia do ano no início da janela prevista; ciclo de 365,2425 dias.',
  },
  {
    title: 'Município',
    count: 1,
    names: ['city'],
    description:
      'Identificador categórico das cinco cidades, transformado por one-hot encoding.',
  },
  {
    title: 'Temperatura',
    count: 2,
    names: details.features.slice(14, 16),
    description:
      'Temperatura média (°C) em janelas de 4 e 8 semanas, encerradas em t−1.',
  },
  {
    title: 'Precipitação',
    count: 2,
    names: details.features.slice(16, 18),
    description:
      'Chuva acumulada (mm) em janelas de 4 e 8 semanas, encerradas em t−1.',
  },
];
const baselines: Record<string, string> = {
  persistence_4w: 'Soma das últimas 4 semanas',
  persistence_last_week: '4 × notificações da última semana',
  seasonal_naive: 'Referência sazonal',
};

export default function ModelGuide() {
  return (
    <section
      className="hm-guide"
      aria-label="Detalhes do modelo e dos experimentos"
    >
      <div className="hm-guide-intro">
        <div>
          <span className="hm-section-label">
            MODELO EXIBIDO NOS GRÁFICOS · {details.sourceVersion}
          </span>
          <h2>Poisson com correção da persistência</h2>
          <p>
            Regressão para a soma das notificações nas quatro semanas seguintes.
            Um modelo compartilhado pelas cinco cidades, com correção reduzida
            em períodos de baixa atividade.
          </p>
        </div>
        <a href={assetUrl('health-meeting/model-details.json')} download>
          Baixar ficha técnica (JSON) ↓
        </a>
      </div>
      <dl className="hm-guide-facts">
        <div>
          <dt>Atributos de entrada</dt>
          <dd>{details.features.length}</dd>
        </div>
        <div>
          <dt>Linhas de treino</dt>
          <dd>{decimal(details.train.n)}</dd>
        </div>
        <div>
          <dt>Previsões no teste</dt>
          <dd>{details.test.n}</dd>
        </div>
        <div>
          <dt>Ajustes da v44 nesta rodada</dt>
          <dd>{details.estimatorFits}</dd>
        </div>
      </dl>

      <details className="hm-guide-section" open>
        <summary>
          <span>01</span> Como a predição é calculada
        </summary>
        <div className="hm-guide-content">
          <ol className="hm-model-flow">
            <li>
              <strong>Histórico e clima</strong>
              <span>Somente datas anteriores ou iguais à origem.</span>
            </li>
            <li>
              <strong>Pré-processamento</strong>
              <span>Imputação, padronização e codificação da cidade.</span>
            </li>
            <li>
              <strong>Regressão Poisson</strong>
              <span>
                Correção multiplicativa de uma previsão de persistência.
              </span>
            </li>
            <li>
              <strong>Ajuste de atividade</strong>
              <span>
                Reduz a correção quando a atividade recente está baixa.
              </span>
            </li>
          </ol>
          <div className="hm-guide-columns">
            <div>
              <h3>Formulação</h3>
              <p>
                N[t] é o total notificado na semana de referência já encerrada.
                O alvo é Y[t] = N[t+1] + … + N[t+4]. Os registros usados são
                retrospectivos; sua disponibilidade original não foi comprovada.
              </p>
              <div
                className="hm-model-equation"
                aria-label="Base igual ao máximo entre 1 e quatro vezes N de t. Predição igual à base vezes a exponencial de g vezes f de X."
              >
                <code>b = max(1, 4 × N[t])</code>
                <code>ŷ = b × exp(g × f(X))</code>
              </div>
              <p>
                f(X) é a função linear do Poisson sobre os atributos
                transformados. g = {decimal(details.selectedGamma)} quando a
                soma das últimas quatro semanas está até o quantil municipal{' '}
                {decimal(details.selectedQuantile)} do treino; fora dessa
                condição, g = 1. A redução aproxima a previsão da base, sem
                alterar o alvo.
              </p>
              <p>
                A base do modelo usa <strong>4 × a última semana</strong>. A
                linha de referência opcional nos gráficos usa{' '}
                <strong>a soma das últimas quatro semanas</strong>; são
                referências distintas.
              </p>
            </div>
            <div>
              <h3>Treinamento e regularização</h3>
              <p>
                O estimador recebe Y/b com peso b, mantendo o objetivo Poisson
                na escala de contagens. O offset é fixo; não é um atributo com
                coeficiente aprendido.
              </p>
              <dl className="hm-guide-parameters">
                <div>
                  <dt>Regularização L2 · α configurado</dt>
                  <dd>{decimal(details.parameters.alpha)}</dd>
                </div>
                <div>
                  <dt>Máximo de iterações</dt>
                  <dd>{decimal(details.parameters.max_iter)}</dd>
                </div>
                <div>
                  <dt>Tolerância configurada</dt>
                  <dd>10⁻⁶</dd>
                </div>
                <div>
                  <dt>Combinações quantil × intensidade</dt>
                  <dd>{details.candidateCount}</dd>
                </div>
              </dl>
              <p>
                O wrapper divide α e a tolerância pela média de b no treino,
                compensando a normalização dos pesos pelo estimador. O
                intercepto não é penalizado. A saída é uma média esperada, que
                pode ter casas decimais; o site arredonda apenas a apresentação.
              </p>
            </div>
          </div>
        </div>
      </details>

      <details className="hm-guide-section">
        <summary>
          <span>02</span> Variáveis de entrada e transformações
        </summary>
        <div className="hm-guide-content">
          <p>
            São 17 variáveis numéricas e uma categórica antes da codificação. O
            total de colunas após one-hot encoding e indicadores de ausência
            pode ser maior que 18.
          </p>
          <div className="hm-feature-list">
            {groups.map((group) => (
              <section key={group.title}>
                <div>
                  <h3>{group.title}</h3>
                  <small>
                    {group.count} {group.count === 1 ? 'atributo' : 'atributos'}
                  </small>
                </div>
                <div>
                  <p>{group.description}</p>
                  <p className="hm-feature-names">
                    {group.names.map((name) => (
                      <code key={name}>{name}</code>
                    ))}
                  </p>
                </div>
              </section>
            ))}
          </div>
          <h3>Tratamento dos dados</h3>
          <p>
            Valores numéricos ausentes recebem a mediana do treino; colunas
            inteiramente ausentes no treino recebem zero. Há indicadores de
            ausência. Os numéricos são padronizados e a cidade recebe one-hot
            encoding. Cada transformação é ajustada apenas no treino
            correspondente, inclusive nos blocos internos.
          </p>
          <h3>Fontes e disponibilidade</h3>
          <p>
            As contagens vêm das séries históricas consolidadas de notificações
            SINAN. O clima é ERA5 via Open-Meteo, em uma célula próxima à sede
            urbana, com defasagem conservadora de uma semana. Não é uma média de
            todo o município. As versões originalmente disponíveis em cada data
            não foram reconstruídas.
          </p>
          <p>
            <strong>IVS, IDHM, renda e CNES não entram neste modelo.</strong>{' '}
            São indicadores de contexto no mapa das UDHs. Umidade, texto, redes
            neurais e relações espaciais entre regiões também não integram esta
            configuração.
          </p>
        </div>
      </details>

      <details className="hm-guide-section">
        <summary>
          <span>03</span> Protocolo temporal e experimentos
        </summary>
        <div className="hm-guide-content">
          <ol className="hm-experiment-timeline">
            <li>
              <strong>Desenvolvimento · 2019–2024</strong>
              <p>
                Validação por seis temporadas anuais. As cinco configurações
                foram selecionadas pelo MAE macro médio anual. Esse
                desenvolvimento já incluiu 2024.
              </p>
            </li>
            <li>
              <strong>Ajuste final · antes de 2024</strong>
              <p>
                Histórico desde 2015; após aquecimento e purga,{' '}
                {decimal(details.train.n)} linhas elegíveis com referências de{' '}
                {date(details.train.first_week)} a{' '}
                {date(details.train.last_week)}. Todos os alvos de treino
                terminam antes de 01/01/2024.
              </p>
            </li>
            <li>
              <strong>Avaliação · 2024–2025</strong>
              <p>
                104 semanas × 5 cidades = 520 previsões. Pesos fixos durante o
                teste, com atributos atualizados semanalmente. O último alvo
                termina em {date(details.test.last_target_end)}. Não é uma
                previsão recursiva de dois anos.
              </p>
            </li>
          </ol>
          <h3>Seleção interna da v44</h3>
          <p>
            Três blocos temporais de 26 semanas, mantendo todos os municípios da
            mesma semana juntos. Rótulos que ainda não terminaram são removidos
            do treino em cada fronteira. Quantis 0,25 / 0,50 / 0,75 e
            intensidades 0 / 0,25 / 0,50 / 0,75 / 1 são comparados pelo MAE
            macro municipal médio. Os 18 atributos e α = 0,1 permanecem fixos.
            Resultado: quantil 0,75 e intensidade 0,5.
          </p>
          <div
            className="hm-guide-table"
            tabIndex={0}
            role="region"
            aria-label="Blocos de validação interna"
          >
            <table>
              <caption>Blocos internos usados nesta execução da v44</caption>
              <thead>
                <tr>
                  <th>Bloco</th>
                  <th>Último alvo de treino</th>
                  <th>Validação · referências</th>
                  <th>Treino / validação</th>
                </tr>
              </thead>
              <tbody>
                {details.innerFolds.map((f) => (
                  <tr key={f.inner_fold}>
                    <td>{f.inner_fold}</td>
                    <td>{date(f.training_last_label_ready_date)}</td>
                    <td>
                      {date(f.validation_first_week)} –{' '}
                      {date(f.validation_last_week)}
                    </td>
                    <td>
                      {decimal(f.n_train)} / {f.n_validation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Comparação das cinco configurações</h3>
          <p>
            Mesma coorte e mesmo alvo no teste. As métricas abaixo cobrem
            2024–2025 e não mudam com os filtros dos gráficos.
          </p>
          <div
            className="hm-guide-table"
            tabIndex={0}
            role="region"
            aria-label="Resultados dos experimentos"
          >
            <table>
              <caption>
                Teste retrospectivo · 520 previsões por configuração
              </caption>
              <thead>
                <tr>
                  <th>Configuração</th>
                  <th>MAE</th>
                  <th>WAPE</th>
                  <th>Viés</th>
                </tr>
              </thead>
              <tbody>
                {details.variants.map((v) => (
                  <tr
                    key={v.version}
                    className={
                      v.version === details.sourceVersion
                        ? 'hm-guide-current'
                        : undefined
                    }
                  >
                    <th scope="row">
                      {v.version}
                      <small>
                        {v.label}
                        {v.version === details.sourceVersion
                          ? ' · exibida no site'
                          : ''}
                      </small>
                    </th>
                    <td>{decimal(v.mae)}</td>
                    <td>{pct(v.wape)}</td>
                    <td>{decimal(v.bias)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            A v31 teve o menor erro neste bloco. A v44 permanece a referência
            selecionada pela validação anual; a tabela não altera o modelo dos
            gráficos. A v31 selecionou oito atributos numéricos de
            histórico/sazonalidade e cidade dentre 109 candidatos; isso não
            demonstra que clima ou variáveis sociais sejam dispensáveis em
            outros contextos.
          </p>
          <p>
            A rodada das cinco configurações utilizou 56 ajustes: 51 internos e
            cinco finais. Na v44, as 15 combinações reutilizam os mesmos três
            ajustes internos, seguidos de um ajuste final.
          </p>
        </div>
      </details>

      <details className="hm-guide-section">
        <summary>
          <span>04</span> Métricas, referências e limites
        </summary>
        <div className="hm-guide-content">
          <dl className="hm-guide-glossary">
            <div>
              <dt>MAE</dt>
              <dd>
                Média de |previsto − observado|, em notificações. Menor é
                melhor.
              </dd>
            </div>
            <div>
              <dt>WAPE</dt>
              <dd>
                100 × soma dos erros absolutos / soma dos observados. O peso dos
                municípios depende de seu volume de notificações; não é uma
                média simples dos percentuais municipais.
              </dd>
            </div>
            <div>
              <dt>Viés</dt>
              <dd>
                Média de previsto − observado. Valores negativos indicam
                subestimação média.
              </dd>
            </div>
            <div>
              <dt>MAE macro anual</dt>
              <dd>
                No desenvolvimento, municípios têm peso igual dentro de cada
                temporada e as seis temporadas têm peso igual. Não equivale ao
                WAPE agregado do teste.
              </dd>
            </div>
          </dl>
          <div
            className="hm-guide-table"
            tabIndex={0}
            role="region"
            aria-label="Referências simples no teste"
          >
            <table>
              <caption>Referências simples · mesma coorte de teste</caption>
              <thead>
                <tr>
                  <th>Referência</th>
                  <th>MAE</th>
                  <th>WAPE</th>
                </tr>
              </thead>
              <tbody>
                {details.baselines.map((b) => (
                  <tr key={b.model}>
                    <th scope="row">{baselines[b.model]}</th>
                    <td>{decimal(b.mae)}</td>
                    <td>{pct(b.wape)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="hm-guide-limitations">
            <li>
              2024 e 2025 já foram explorados no projeto. Esta avaliação é
              retrospectiva, não uma confirmação prospectiva independente.
            </li>
            <li>
              As datas dos eventos respeitam as origens, mas a disponibilidade
              histórica dos dados consolidados e da reanálise não foi
              comprovada. O protocolo usa buffer adicional de maturação zero.
            </li>
            <li>
              As janelas de quatro semanas se sobrepõem. As 520 linhas não são
              totais independentes e não devem ser somadas para calcular
              notificações anuais.
            </li>
            <li>
              Não há intervalos de predição calibrados nem predições por UDH. O
              alvo inclui notificações posteriormente descartadas, não apenas
              casos confirmados.
            </li>
          </ul>
        </div>
      </details>
      <p className="hm-guide-source">
        Rodada congelada de 13/09/2026 · {details.sourceRun}. Ficha técnica
        extraída das configurações, esquema de atributos e métricas preservadas,
        com hashes dos artefatos no JSON para rastreabilidade.
      </p>
    </section>
  );
}
