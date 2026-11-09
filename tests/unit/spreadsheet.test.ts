import { describe, expect, it } from 'vitest';
import { calculateCell } from '../../packages/contracts';
describe('spreadsheet calculations', () => {
  it('calculates references, ranges, precedence and negative values', () => {
    const cells = { A1: '12', B1: '18', C1: '=SUM(A1:B1)', D1: '=(C1-5)*2', E1: '=-A1+2' };
    expect(calculateCell(cells, 'C1')).toBe(30);
    expect(calculateCell(cells, 'D1')).toBe(50);
    expect(calculateCell(cells, 'E1')).toBe(-10);
  });
  it('rejects cycles, divide by zero and executable or external formulas', () => {
    expect(calculateCell({ A1: '=B1', B1: '=A1' }, 'A1')).toBe('#CYCLE!');
    expect(calculateCell({ A1: '=1/0' }, 'A1')).toBe('#DIV/0!');
    expect(calculateCell({ A1: '=globalThis.fetch("https://example.com")' }, 'A1')).toBe('#ERROR!');
    expect(calculateCell({ A1: '=WEBSERVICE("https://example.com")' }, 'A1')).toBe('#ERROR!');
  });
  it('bounds expensive nested ranges while reusing shared references', () => {
    const cells: Record<string, string> = { A1: '1' };
    for (let row = 2; row <= 30; row++) cells[`A${row}`] = `=SUM(A1:Z${row - 1})`;
    expect(calculateCell(cells, 'A10')).toBe(256);
    expect(calculateCell(cells, 'A30')).toBe('#LIMIT!');
  });
});
