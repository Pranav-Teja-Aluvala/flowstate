import { z } from 'zod';
// CodeMirror and y-codemirror use LF positions. Normalize at every text boundary.
export const normalizeCodeText = (content: string) => content.replace(/\r\n?/g, '\n');
export function repositoryCodeText(content: string, original: string) {
  const normalized = normalizeCodeText(content);
  return original.includes('\r\n') && !original.replace(/\r\n/g, '').includes('\n')
    ? normalized.replace(/\n/g, '\r\n')
    : normalized;
}
export const roles = ['owner', 'admin', 'editor', 'viewer'] as const;
export type Role = (typeof roles)[number];
export function canWrite(role: Role) {
  return role !== 'viewer';
}
export function canManage(role: Role) {
  return role === 'owner' || role === 'admin';
}
export const nameSchema = z.string().trim().min(1).max(80);
export const emailSchema = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(72, 'Use at most 72 characters.')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must fit within 72 UTF-8 bytes.');
export const projectSchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(1000),
});
