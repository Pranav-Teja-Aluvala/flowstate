export const SHEET_MAX_ROWS = 100;
export const SHEET_MAX_COLUMNS = 26;
export function sheetDimension(value: unknown, fallback: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}
export function columnName(index: number) {
  return String.fromCharCode(65 + index);
}
export function calculateCell(
  cells: Readonly<Record<string, string>>,
  key: string,
  visited = new Set<string>(),
  calculation = { remaining: 10_000, cache: new Map<string, string | number>() },
): string | number {
  if (visited.has(key) || visited.size > 20) return '#CYCLE!';
  if (--calculation.remaining < 0) return '#LIMIT!';
  if (calculation.cache.has(key)) return calculation.cache.get(key)!;
  const value = cells[key] || '';
  if (!value.startsWith('=')) return value;
  const next = new Set(visited);
  next.add(key);
  try {
    const numberAt = (reference: string) => {
      if (!/^[A-Z](?:[1-9]|[1-9]\d|100)$/.test(reference)) throw new Error();
      const result = calculateCell(cells, reference, next, calculation);
      if (typeof result === 'string' && result.startsWith('#')) throw new Error(result);
      const number = Number(result || 0);
      return Number.isFinite(number) ? number : 0;
    };
    let expression = value.slice(1).toUpperCase().replace(/\s/g, '');
    expression = expression.replace(
      /SUM\(([A-Z])(\d+):([A-Z])(\d+)\)/g,
      (_match, first: string, r1: string, last: string, r2: string) => {
        const low = Number(r1),
          high = Number(r2);
        if (low < 1 || high > 100 || high < low || last < first) throw new Error();
        let total = 0;
        for (let c = first.charCodeAt(0); c <= last.charCodeAt(0); c++)
          for (let r = low; r <= high; r++) total += numberAt(String.fromCharCode(c) + r);
        return String(total);
      },
    );
    const tokens = expression.match(/[A-Z]\d+|(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]/g) || [];
    if (!tokens.length || tokens.length > 100 || tokens.join('') !== expression) throw new Error();
    let position = 0;
    const primary = (): number => {
      const token = tokens[position++];
      if (token === '-') return -primary();
      if (token === '+') return primary();
      if (token === '(') {
        const n = sum();
        if (tokens[position++] !== ')') throw new Error();
        return n;
      }
      if (!token) throw new Error();
      if (/^[A-Z]/.test(token)) return numberAt(token);
      const n = Number(token);
      if (!Number.isFinite(n)) throw new Error();
      return n;
    };
    const product = (): number => {
      let n = primary();
      while (['*', '/'].includes(tokens[position])) {
        const op = tokens[position++],
          right = primary();
        if (op === '/' && right === 0) throw new Error('#DIV/0!');
        n = op === '*' ? n * right : n / right;
      }
      return n;
    };
    const sum = (): number => {
      let n = product();
      while (['+', '-'].includes(tokens[position])) {
        const op = tokens[position++],
          right = product();
        n = op === '+' ? n + right : n - right;
      }
      return n;
    };
    const result = sum();
    if (position !== tokens.length || !Number.isFinite(result)) throw new Error();
    const rounded = Number(result.toFixed(10));
    calculation.cache.set(key, rounded);
    return rounded;
  } catch (error) {
    return error instanceof Error && error.message.startsWith('#') ? error.message : '#ERROR!';
  }
}
