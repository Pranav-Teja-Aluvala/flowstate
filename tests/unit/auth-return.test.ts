import { describe, expect, it } from 'vitest';
import { authReturnPath } from '../../packages/contracts';
describe('authentication return destinations', () => {
  it('keeps invitation and workspace destinations across sign in', () => {
    expect(authReturnPath('/join/a-valid_invitation-token')).toBe('/join/a-valid_invitation-token');
    expect(authReturnPath('/app?new=1')).toBe('/app?new=1');
    expect(authReturnPath('/w/team/p/project/documents')).toBe('/w/team/p/project/documents');
  });
  it('rejects external, normalized external, control-character and unsupported destinations', () => {
    for (const value of [
      'https://example.com/w/team',
      '//example.com/app',
      '/\\example.com/app',
      '/w/../../api/github/start',
      '/app\nX-Test: yes',
      '/api/github/start',
      undefined,
      'x'.repeat(2001),
    ])
      expect(authReturnPath(value)).toBe('/app');
  });
});
