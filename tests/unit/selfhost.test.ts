import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  prepareSelfhost,
  composeArguments,
  validateConfig,
} from '../../scripts/lib/selfhost-config.mjs';

describe('self-hosted instance setup', () => {
  it('generates independent credentials without cloud or GitHub accounts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowstate-setup-'));
    const first = prepareSelfhost({ directory });
    const second = prepareSelfhost({ directory: mkdtempSync(join(tmpdir(), 'flowstate-setup-')) });
    expect(first.config.APP_URL).toBe('http://localhost:3000');
    expect(first.config.GITHUB_CLIENT_SECRET).toBe('');
    expect(first.config.RUNNER_ENABLED).toBe('false');
    expect(first.config.POSTGRES_PASSWORD).not.toBe(second.config.POSTGRES_PASSWORD);
    expect(first.config.COLLABORATION_SECRET).not.toBe(second.config.COLLABORATION_SECRET);
    expect(first.config.COLLABORATION_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(composeArguments(first.config)).not.toContain('compose.public.yml');
  });
  it('keeps existing secrets and development configuration unchanged', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowstate-preserve-'));
    writeFileSync(resolve(directory, '.env'), 'DATABASE_URL=keep-development-data\n');
    const first = prepareSelfhost({ directory });
    const original = readFileSync(first.filename, 'utf8');
    expect(prepareSelfhost({ directory }).created).toBe(false);
    expect(readFileSync(first.filename, 'utf8')).toBe(original);
    expect(readFileSync(resolve(directory, '.env'), 'utf8')).toBe(
      'DATABASE_URL=keep-development-data\n',
    );
    expect(() => prepareSelfhost({ directory, domain: 'different.example.com' })).toThrow(
      'preserved',
    );
    expect(readFileSync(first.filename, 'utf8')).toBe(original);
  });
  it('configures HTTPS and same-origin WSS for an operator-owned domain', () => {
    const result = prepareSelfhost({
      directory: mkdtempSync(join(tmpdir(), 'flowstate-public-')),
      domain: 'team.example.com',
    });
    expect(result.config.APP_URL).toBe('https://team.example.com');
    expect(result.config.NEXT_PUBLIC_COLLABORATION_URL).toBe(
      'wss://team.example.com/collaboration',
    );
    expect(result.config.COOKIE_SECURE).toBe('true');
    expect(composeArguments(result.config)).toContain('compose.public.yml');
  });
  it('validates ports, origins and domain input before writing configuration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowstate-invalid-'));
    expect(() => prepareSelfhost({ directory, domain: 'example.com;command' })).toThrow();
    expect(() => prepareSelfhost({ directory, webPort: '0' })).toThrow();
    expect(() => prepareSelfhost({ directory, webPort: '3100', syncPort: '3100' })).toThrow();
    const result = prepareSelfhost({ directory, webPort: '3100', syncPort: '1334' });
    expect(result.config.APP_URL).toBe('http://localhost:3100');
    expect(result.config.NEXT_PUBLIC_COLLABORATION_URL).toBe('ws://localhost:1334');
    expect(() =>
      validateConfig({ ...result.config, ALLOWED_ORIGINS: 'https://unrelated.example.com' }),
    ).toThrow('ALLOWED_ORIGINS');
  });
});
