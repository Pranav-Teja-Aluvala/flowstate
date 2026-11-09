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
