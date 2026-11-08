import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  signOfficeToken,
  verifyOfficeToken,
  officeCallback,
  officeDownloadURL,
  officeDocumentType,
  officeSettings,
} from '../../apps/web/src/lib/office-policy';
beforeEach(() => {
  vi.stubEnv('OFFICE_JWT_SECRET', 'office_test_key_only_at_least_32_characters');
  vi.stubEnv('OFFICE_PUBLIC_URL', 'https://office.example.test');
  vi.stubEnv('OFFICE_INTERNAL_URL', 'http://office');
  vi.stubEnv('OFFICE_APP_URL', 'http://web:3000');
});
afterEach(() => vi.unstubAllEnvs());
describe('office authorization boundaries', () => {
  it('requires separate browser hostnames so office requests do not receive app cookies', () => {
    vi.stubEnv('APP_URL', 'https://office.example.test:3000');
    expect(() => officeSettings()).toThrow('separate hostname');
  });
  it('rejects expired, modified and wrong-algorithm tokens', () => {
    const token = signOfficeToken({ exp: Date.now() / 1000 + 60, kind: 'test' });
    expect(verifyOfficeToken(token).kind).toBe('test');
    expect(() => verifyOfficeToken(`${token.slice(0, -8)}modified`)).toThrow('denied');
    expect(() => verifyOfficeToken(signOfficeToken({ exp: 1 }))).toThrow('denied');
    expect(() =>
      verifyOfficeToken(
        `${Buffer.from('{"alg":"none"}').toString('base64url')}.${token.split('.')[1]}.`,
      ),
    ).toThrow('denied');
  });
  it('accepts signed callback payloads but rejects browser tokens and wrong purposes', () => {
    const key = randomUUID();
    expect(
      officeCallback(signOfficeToken({ operation: 'callback', payload: { key, status: 4 } })).key,
    ).toBe(key);
    expect(() =>
      officeCallback(signOfficeToken({ document: { key }, editorConfig: { mode: 'edit' } })),
    ).toThrow();
    expect(() =>
      officeCallback(signOfficeToken({ operation: 'download', payload: { key, status: 4 } })),
    ).toThrow('purpose');
  });
  it('permits only configured office cache URLs and maps them to the internal service', () => {
    expect(
      officeDownloadURL('https://office.example.test/cache/files/key/output.pdf?md5=fixture'),
    ).toBe('http://office/cache/files/key/output.pdf?md5=fixture');
    for (const url of [
      'https://other.example/cache/files/key/output.pdf',
      'http://169.254.169.254/cache/files/key/output.pdf',
      'https://user:password@office.example.test/cache/files/key/output.pdf',
      'https://office.example.test/secret',
      'https://office.example.test/cache/files/../../secret',
    ])
      expect(() => officeDownloadURL(url)).toThrow('denied');
  });
  it('maps office formats explicitly without pretending arbitrary uploads are editable', () => {
    expect(officeDocumentType('sheet.xlsx').documentType).toBe('cell');
    expect(officeDocumentType('slides.pptx').documentType).toBe('slide');
    expect(officeDocumentType('brief.docx').documentType).toBe('word');
    expect(officeDocumentType('form.pdf').documentType).toBe('pdf');
    expect(() => officeDocumentType('notes.txt')).toThrow('Open a');
  });
});
