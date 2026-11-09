import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import {
  encryptToken,
  decryptToken,
  safeCodePath,
  githubRepositoryURL,
} from '../../packages/github/security';
import { containerConfiguration, verifyRunnerTicket } from '../../apps/runner/src/policy';
import { readRepositoryFile } from '../../packages/github';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('private source and runner boundaries', () => {
  it('accepts repository URLs without treating arbitrary URLs or embedded credentials as repository access', () => {
    expect(githubRepositoryURL('https://github.com/team/project.git')).toEqual({
      owner: 'team',
      name: 'project',
    });
    for (const value of [
      'http://github.com/team/project',
      'https://token@github.com/team/project',
      'https://github.com/team/project?token=secret',
      'https://github.com/team/project/tree/main',
      'https://other.example/team/project',
    ])
      expect(() => githubRepositoryURL(value)).toThrow('GitHub repository URL');
  });
  it('encrypts credentials with authenticated encryption and rejects tampering', () => {
    vi.stubEnv('GITHUB_TOKEN_KEY', randomBytes(32).toString('hex'));
    const encrypted = encryptToken('test-private-user-token');
    expect(encrypted).not.toContain('test-private');
    expect(decryptToken(encrypted)).toBe('test-private-user-token');
    const parts = encrypted.split('.');
    const bytes = Buffer.from(parts[2], 'base64url');
    bytes[0] ^= 1;
    parts[2] = bytes.toString('base64url');
    expect(() => decryptToken(parts.join('.'))).toThrow();
    vi.stubEnv('GITHUB_TOKEN_KEY', randomBytes(32).toString('hex'));
    expect(() => decryptToken(encrypted)).toThrow();
  });
  it('rejects traversal, git metadata and host-specific paths', () => {
    for (const path of [
      '../secret',
      '/etc/passwd',
      'src/../../x',
      'a\\b',
      '.git/config',
      'src/.Git/config',
      'a//b',
      'file\0name',
    ])
      expect(() => safeCodePath(path)).toThrow();
    expect(safeCodePath('src/company-code.ts')).toBe('src/company-code.ts');
  });
  it('limits terminal admission to the signed purpose, session and expiry', () => {
    const secret = randomBytes(32).toString('hex');
    const sign = (data: unknown) => {
      const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
      return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    };
    const data = {
      kind: 'terminal',
      sessionId: '00000000-0000-4000-8000-000000000000',
      sessionHash: 'a'.repeat(64),
      expiresAt: Date.now() + 60_000,
    };
    expect(verifyRunnerTicket(sign(data), secret).sessionId).toBe(data.sessionId);
    expect(() => verifyRunnerTicket(sign({ ...data, kind: 'document' }), secret)).toThrow();
    expect(() =>
      verifyRunnerTicket(sign({ ...data, expiresAt: Date.now() - 1 }), secret),
    ).toThrow();
    expect(() => verifyRunnerTicket(sign(data) + 'x', secret)).toThrow();
  });
  it('starts non-root containers without host mounts, credentials or networking', () => {
    const config = containerConfiguration('test', 'flowstate-runner:local');
    expect(config.User).toBe('1000:1000');
    expect(config.HostConfig.NetworkMode).toBe('none');
    expect(config.HostConfig.ReadonlyRootfs).toBe(true);
    expect(config.HostConfig.CapDrop).toEqual(['ALL']);
    expect(config.HostConfig.SecurityOpt).toContain('no-new-privileges:true');
    expect(config.HostConfig).not.toHaveProperty('Binds');
    expect(config.HostConfig).not.toHaveProperty('Mounts');
    expect(config.HostConfig.Memory).toBeLessThanOrEqual(512 * 1024 * 1024);
    expect(config.Env.join()).not.toMatch(/TOKEN|SECRET|DATABASE/);
    expect(config.HostConfig.AutoRemove).toBe(true);
  });
  it('refuses symlink blobs before reading their contents', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ tree: { sha: 'tree' } }))
      .mockResolvedValueOnce(
        Response.json({
          tree: [{ path: 'link', type: 'blob', mode: '120000', sha: 'secret', size: 10 }],
        }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(
      readRepositoryFile('fake-token', { owner: 'company', name: 'repo' }, 'commit', 'link'),
    ).rejects.toThrow('Symlinks');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
