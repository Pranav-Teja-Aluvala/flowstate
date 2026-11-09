import { describe, it, expect } from 'vitest';
import { canManage, canWrite, passwordSchema, projectSchema } from '../../packages/contracts';
describe('workspace capabilities', () => {
  it('rejects viewer writes and restricts membership management', () => {
    expect(canWrite('viewer')).toBe(false);
    expect(canManage('viewer')).toBe(false);
    expect(canWrite('editor')).toBe(true);
    expect(canManage('editor')).toBe(false);
    expect(canManage('admin')).toBe(true);
    expect(canManage('owner')).toBe(true);
  });
  it('rejects bcrypt truncation, including multi-byte passwords', () => {
    expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false);
    expect(passwordSchema.safeParse('🦋'.repeat(20)).success).toBe(false);
    expect(passwordSchema.safeParse('a long unique passphrase').success).toBe(true);
  });
  it('rejects empty project names and unbounded descriptions', () => {
    expect(projectSchema.safeParse({ name: '  ', description: '' }).success).toBe(false);
    expect(
      projectSchema.safeParse({ name: 'Project', description: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });
});
