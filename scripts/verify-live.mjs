import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

const url = 'https://gbmalta.github.io/vigiar-web/';
for (let attempt = 1; attempt <= 8; attempt++) {
  const result = spawnSync(
    process.execPath,
    ['scripts/verify-deployment.mjs', url],
    { encoding: 'utf8' },
  );
  if (result.status === 0) {
    process.stdout.write(result.stdout);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### Publicação verificada\n\n[Site público](${url}#metricas): HTML, caminhos de assets, imports e hashes de todos os arquivos públicos conferidos.\n`,
      );
    process.exit(0);
  }
  if (attempt === 8) {
    process.stderr.write(
      result.stderr || result.stdout || 'Verification failed.\n',
    );
    process.exit(result.status || 1);
  }
  console.log(`Publication propagation: retry ${attempt}/8 in 10 seconds.`);
  await setTimeout(10000);
}
