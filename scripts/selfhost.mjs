import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  prepareSelfhost,
  parseConfig,
  validateConfig,
  composeArguments,
  enableLocalOffice,
} from './lib/selfhost-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const help = `FLOWSTATE self-hosting

npm run selfhost                          Generate private config and start the core stack
npm run setup                            Generate .env.selfhost without starting anything
npm run setup:office                     Enable the optional local office editor profile
npm run selfhost -- --port 3100 --sync-port 1334
npm run selfhost -- --domain workspace.example.com
npm run selfhost:stop                     Stop services; keep database volumes
npm run selfhost:logs                     Follow application logs
npm run doctor                           Check prerequisites and configuration

Requires Node.js 24 and Docker Engine with Compose v2. No GitHub App or cloud database is required for the core application.
`;
function probe(args) {
  return spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
  });
}
function prerequisites() {
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('Install Node.js 24 or newer before running this helper.');
  const cli = probe(['--version']);
  if (cli.error || cli.status !== 0)
    throw new Error(
      'Docker is not installed or is not on PATH. Install Docker Engine / Docker Desktop with Compose, then run npm run selfhost again.',
    );
  if (probe(['compose', 'version']).status !== 0) throw new Error('Docker Compose v2 is required.');
  const engine = probe(['info', '--format', '{{.OSType}}']);
  if (engine.status !== 0)
    throw new Error('Docker Engine is not reachable. Start Docker, then retry.');
  if (engine.stdout.trim() !== 'linux')
    throw new Error('Switch Docker to Linux containers, then retry.');
}
async function docker(args) {
  const code = await new Promise((resolveExit, reject) => {
    const child = spawn('docker', args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('close', (value) => resolveExit(value ?? 1));
  });
  if (code !== 0)
    throw new Error(
      'Docker command failed. Check the output above; existing database volumes have not been removed.',
    );
}
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean' },
      domain: { type: 'string' },
      port: { type: 'string' },
      'sync-port': { type: 'string' },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  const command = positionals[0] || 'start';
  if (
    positionals.length > 1 ||
    !['setup', 'setup-office', 'start', 'stop', 'logs', 'doctor'].includes(command)
  )
    throw new Error(help);
  if (command === 'setup-office') {
    const { created } = enableLocalOffice({ directory: root });
    console.log(
      `${created ? 'Enabled' : 'Preserved'} the optional local office configuration. Secret values are not printed. Run npm run selfhost when Docker is ready.`,
    );
    return;
  }
  if (command === 'doctor') {
    console.log(`Node.js ${process.versions.node}`);
    prerequisites();
    console.log('Docker Engine and Compose: ready (Linux containers).');
    const file = resolve(root, '.env.selfhost');
    if (!existsSync(file)) {
      console.log('Configuration: not created yet. Run npm run setup.');
      return;
    }
    const config = validateConfig(parseConfig(readFileSync(file, 'utf8')));
    console.log(`Configuration: valid; ${config.FLOWSTATE_MODE} mode; ${config.APP_URL}`);
    await docker([...composeArguments(config), 'config', '--quiet']);
    return;
  }
  if (['stop', 'logs'].includes(command) && !existsSync(resolve(root, '.env.selfhost')))
    throw new Error('No .env.selfhost was found. Run npm run setup first.');
  const { config, filename, created } = prepareSelfhost({
    directory: root,
    domain: values.domain,
    webPort: values.port,
    syncPort: values['sync-port'],
  });
  console.log(`${created ? 'Created' : 'Preserved'} ${filename}. Secret values are not printed.`);
  if (command === 'setup') {
    console.log('Core setup needs no GitHub App or hosted database. Next: npm run selfhost');
    return;
  }
  prerequisites();
  const base = composeArguments(config);
  if (command === 'stop') {
    await docker([...base, 'down']);
    console.log('Services stopped. Database volumes and private configuration were kept.');
    return;
  }
  if (command === 'logs') {
    await docker([...base, 'logs', '--follow', 'web', 'collaboration']);
    return;
  }
  await docker([...base, 'config', '--quiet']);
  await docker([...base, 'up', '--build', '--detach']);
  console.log(`FLOWSTATE is starting at ${config.APP_URL}`);
  if (config.FLOWSTATE_MODE === 'public')
    console.log(
      'Point this domain at your server and allow ports 80/443 for HTTPS. Public DNS/certificate readiness is not checked by this helper.',
    );
  console.log(
    'Create an account and workspace in the browser. Use npm run selfhost:logs for startup details.',
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Self-host setup failed.');
  process.exitCode = 1;
});
