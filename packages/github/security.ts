import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export function credentialKey() {
  const key = Buffer.from(process.env.GITHUB_TOKEN_KEY || '', 'hex');
  if (key.length !== 32) throw new Error('GitHub token encryption is not configured.');
  return key;
}
export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64url')).join('.');
}
export function decryptToken(value: string) {
  const [iv, tag, encrypted] = value.split('.').map((s) => Buffer.from(s, 'base64url'));
  if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !encrypted)
    throw new Error('Invalid encrypted credential.');
  const cipher = createDecipheriv('aes-256-gcm', credentialKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8');
}
export function safeCodePath(value: string) {
  if (
    !value ||
    value.length > 500 ||
    value.split('/').length > 30 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.split('/').some((p) => !p || p === '.' || p === '..' || p.toLowerCase() === '.git') ||
    /[\x00-\x1f]/.test(value)
  )
    throw new Error('Choose a regular repository file path.');
  return value;
}
export function githubRepositoryURL(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
    if (parts.length !== 2) throw new Error();
    const owner = parts[0],
      name = parts[1].replace(/\.git$/, '');
    if (
      !/^[a-zA-Z0-9-]{1,100}$/.test(owner) ||
      !/^[a-zA-Z0-9_.-]{1,100}$/.test(name) ||
      ['.', '..'].includes(name)
    )
      throw new Error();
    return { owner, name };
  } catch {
    throw new Error('Use a GitHub repository URL such as https://github.com/team/project.');
  }
}
