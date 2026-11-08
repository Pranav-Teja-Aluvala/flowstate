import { z } from 'zod';
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
