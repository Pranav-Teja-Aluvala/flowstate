import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

function port(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1 || number > 65535)
    throw new Error('Ports must be between 1 and 65535.');
  return number;
}
export function validDomain(value) {
  return (
    typeof value === 'string' &&
    value.length <= 253 &&
    value.includes('.') &&
    value.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  );
}
export function parseConfig(text) {
  return Object.fromEntries(
    text.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
      return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : [];
    }),
  );
}
export function validateConfig(config) {
  if (
    config.OFFICE_ENABLED === 'true' &&
    (config.FLOWSTATE_MODE !== 'local' || (config.OFFICE_JWT_SECRET || '').length < 32)
  )
    throw new Error(
      'The bundled office profile needs local mode and an OFFICE_JWT_SECRET of at least 32 characters.',
    );
  if (!['local', 'public'].includes(config.FLOWSTATE_MODE))
    throw new Error('Set FLOWSTATE_MODE to local or public in .env.selfhost.');
  if (!/^[a-z0-9][a-z0-9_-]{0,50}$/.test(config.COMPOSE_PROJECT_NAME || ''))
    throw new Error('Invalid COMPOSE_PROJECT_NAME.');
  if (!/^[a-zA-Z0-9_-]{16,}$/.test(config.POSTGRES_PASSWORD || ''))
    throw new Error('POSTGRES_PASSWORD must be a long URL-safe password.');
  if ((config.COLLABORATION_SECRET || '').length < 32)
    throw new Error('COLLABORATION_SECRET must contain at least 32 characters.');
  if (!/^[a-f0-9]{64}$/i.test(config.GITHUB_TOKEN_KEY || ''))
    throw new Error('GITHUB_TOKEN_KEY must contain 64 hex characters.');
  const webPort = port(config.WEB_PORT, 3000);
  const syncPort = port(config.COLLABORATION_PUBLIC_PORT, 1234);
  if (webPort === syncPort) throw new Error('Web and collaboration ports must be different.');
  const origin = new URL(config.APP_URL).origin;
  if (!['http:', 'https:'].includes(new URL(origin).protocol))
    throw new Error('APP_URL must be HTTP or HTTPS.');
  if (
    !(config.ALLOWED_ORIGINS || '')
      .split(',')
      .map((v) => v.trim())
      .includes(origin)
  )
    throw new Error('ALLOWED_ORIGINS must include APP_URL.');
  const socket = new URL(config.NEXT_PUBLIC_COLLABORATION_URL);
  if (!['ws:', 'wss:'].includes(socket.protocol))
    throw new Error('Use ws:// or wss:// for collaboration.');
  if (
    config.FLOWSTATE_MODE === 'public' &&
    (!validDomain(config.FLOWSTATE_DOMAIN) ||
      origin !== `https://${config.FLOWSTATE_DOMAIN}` ||
      socket.protocol !== 'wss:')
  )
    throw new Error('Public mode needs a valid domain, HTTPS APP_URL, and WSS collaboration URL.');
  return config;
}
export function prepareSelfhost({ directory, domain, webPort, syncPort } = {}) {
  const filename = resolve(directory || '.', '.env.selfhost');
  if (domain !== undefined && !validDomain(domain))
    throw new Error('Use a hostname such as workspace.example.com, without a scheme or path.');
  if (existsSync(filename)) {
    const config = validateConfig(parseConfig(readFileSync(filename, 'utf8')));
    if (
      (domain && config.FLOWSTATE_DOMAIN !== domain) ||
      (webPort && Number(config.WEB_PORT) !== Number(webPort)) ||
      (syncPort && Number(config.COLLABORATION_PUBLIC_PORT) !== Number(syncPort))
    )
      throw new Error(
        'Existing .env.selfhost was preserved. Edit its URLs/ports to change modes; do not replace its database password or encryption keys.',
      );
    return { filename, config, created: false };
  }
  const httpPort = port(webPort, 3000);
  const collaborationPort = port(syncPort, 1234);
  const config = validateConfig({
    COMPOSE_PROJECT_NAME: 'flowstate',
    FLOWSTATE_MODE: domain ? 'public' : 'local',
    FLOWSTATE_DOMAIN: domain || '',
    WEB_PORT: String(httpPort),
    COLLABORATION_PUBLIC_PORT: String(collaborationPort),
    POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
    COLLABORATION_SECRET: randomBytes(32).toString('hex'),
    GITHUB_TOKEN_KEY: randomBytes(32).toString('hex'),
    APP_URL: domain ? `https://${domain}` : `http://localhost:${httpPort}`,
    ALLOWED_ORIGINS: domain ? `https://${domain}` : `http://localhost:${httpPort}`,
    NEXT_PUBLIC_COLLABORATION_URL: domain
      ? `wss://${domain}/collaboration`
      : `ws://localhost:${collaborationPort}`,
    COOKIE_SECURE: domain ? 'true' : 'false',
    GITHUB_CLIENT_ID: '',
    GITHUB_CLIENT_SECRET: '',
    GITHUB_APP_SLUG: '',
    RUNNER_ENABLED: 'false',
    RUNNER_INTERNAL_URL: 'http://127.0.0.1:1236',
    NEXT_PUBLIC_RUNNER_URL: 'ws://localhost:1236',
  });
  const text =
    '# Generated for this instance. Keep this file private and back it up with the database.\n# Development .env files are separate and are not changed by setup.\n' +
    Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') +
    '\n';
  writeFileSync(filename, text, { flag: 'wx', mode: 0o600 });
  return { filename, config, created: true };
}
export function composeArguments(config) {
  return [
    'compose',
    '--project-name',
    config.COMPOSE_PROJECT_NAME,
    '--env-file',
    '.env.selfhost',
    '-f',
    'docker-compose.yml',
    ...(config.OFFICE_ENABLED === 'true' ? ['-f', 'compose.office.yml'] : []),
    ...(config.FLOWSTATE_MODE === 'public' ? ['-f', 'compose.public.yml'] : []),
  ];
}
export function enableLocalOffice({ directory } = {}) {
  const result = prepareSelfhost({ directory });
  if (result.config.FLOWSTATE_MODE !== 'local')
    throw new Error(
      'The bundled office profile is local-only. Configure a separate HTTPS office service for a public instance.',
    );
  if (result.config.OFFICE_ENABLED === 'true') {
    if ((result.config.OFFICE_JWT_SECRET || '').length < 32)
      throw new Error('OFFICE_JWT_SECRET must contain at least 32 characters.');
    return { ...result, created: false };
  }
  const secret = result.config.OFFICE_JWT_SECRET || randomBytes(32).toString('hex');
  if (secret.length < 32) throw new Error('OFFICE_JWT_SECRET must contain at least 32 characters.');
  const additions = {
    OFFICE_ENABLED: 'true',
    OFFICE_PUBLIC_URL: result.config.OFFICE_PUBLIC_URL || 'http://127.0.0.1:8082',
    OFFICE_JWT_SECRET: secret,
  };
  appendFileSync(
    result.filename,
    '\n# Optional local office editor\n' +
      Object.entries(additions)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') +
      '\n',
  );
  return { ...result, config: { ...result.config, ...additions }, created: true };
}
