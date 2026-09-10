import { lazy, Suspense, useEffect, useState } from 'react';
import { Atlas } from '@/components/atlas';

const ArticleMetrics = lazy(() => import('@/components/article-metrics'));

export function App() {
  const [metrics, setMetrics] = useState(() =>
    location.hash.startsWith('#metricas'),
  );
  useEffect(() => {
    const change = () => {
      setMetrics(location.hash.startsWith('#metricas'));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return metrics ? (
    <Suspense
      fallback={
        <div className="metrics-loading" role="status">
          Carregando métricas do artigo…
        </div>
      }
    >
      <ArticleMetrics />
    </Suspense>
  ) : (
    <Atlas />
  );
}
