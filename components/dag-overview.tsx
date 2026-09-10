import { ArrowDownToLine, ArrowUpRight, GitBranch } from 'lucide-react';
import { assetUrl } from '@/lib/asset-url';

export function DagOverview() {
  return (
    <section
      className="dag-overview"
      aria-labelledby="dag-heading"
      id="dag-airflow"
    >
      <div className="dag-heading-row">
        <h3 id="dag-heading">
          <GitBranch aria-hidden="true" /> DAG no Airflow
        </h3>
        <span className="dag-success">11/11 concluídas</span>
      </div>
      <p className="dag-name">vigiar_manual_pipeline</p>
      <p>
        Diagrama das tarefas e dependências da carga de 2021 a 2026,
        reconstruído a partir do código e dos registros da execução no Airflow.
      </p>
      <dl className="dag-run-facts">
        <div>
          <dt>Resultado</dt>
          <dd>Sucesso</dd>
        </div>
        <div>
          <dt>Duração da DAG</dt>
          <dd>18 min 31 s</dd>
        </div>
        <div>
          <dt>Execução</dt>
          <dd>
            08/09/2026 · 23:25–23:43<small>Horário de Brasília</small>
          </dd>
        </div>
      </dl>
      <figure className="dag-figure">
        <a
          href={assetUrl('diagrams/vigiar-airflow-dag.svg')}
          target="_blank"
          rel="noreferrer"
          aria-label="Abrir diagrama da DAG em tamanho original"
        >
          <img
            src={assetUrl('diagrams/vigiar-airflow-dag.svg')}
            width={460}
            height={1512}
            loading="lazy"
            alt="DAG com 11 tarefas concluídas: validar ambiente antecede os dez pipelines; o vínculo CNES–UDH também depende dos pipelines de CNES e UDH. Cada tarefa exibe sua duração e tentativa registradas."
          />
        </a>
        <figcaption>
          As setas mostram pré-requisitos. A DAG limita a execução a uma tarefa
          ativa por vez. Os tempos correspondem à tentativa registrada; UDH
          terminou na tentativa 2. Esta é a execução histórica, sem atualização
          em tempo real.
        </figcaption>
      </figure>
      <div className="dag-actions">
        <a
          href={assetUrl('diagrams/vigiar-airflow-dag.svg')}
          target="_blank"
          rel="noreferrer"
        >
          <ArrowUpRight aria-hidden="true" /> Abrir e ampliar
        </a>
        <a
          href={assetUrl('diagrams/vigiar-airflow-dag.svg')}
          download="VIGIAR_DAG_Airflow.svg"
        >
          <ArrowDownToLine aria-hidden="true" /> Baixar diagrama
        </a>
      </div>
    </section>
  );
}
