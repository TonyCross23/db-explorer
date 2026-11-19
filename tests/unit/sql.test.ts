import { it, expect } from 'vitest';
import {
  quoteIdentifier,
  safeRows,
  encodeCell,
} from '../../backend/src/infrastructure/database/sql';
it('quotes untrusted identifiers as a single identifier', () => {
  expect(quoteIdentifier('postgresql', 'a"; DROP TABLE x;--')).toBe('"a""; DROP TABLE x;--"');
  expect(quoteIdentifier('mysql', 'a`b')).toBe('`a``b`');
});
it('preserves large integers and bounds cell and binary payloads', () => {
  expect(encodeCell(9007199254740993n)).toBe('9007199254740993');
  expect(String(encodeCell('x'.repeat(9000))).length).toBeLessThan(8300);
  expect(String(encodeCell(Buffer.alloc(2000))).length).toBeLessThan(400);
});
it('caps serialized result size and reports truncation', () => {
  const { rows, truncated } = safeRows(
    Array.from({ length: 1000 }, () => ({ json: { value: 'x'.repeat(10000) } })),
  );
  expect(truncated).toBe(true);
  expect(rows.length).toBeGreaterThan(0);
  expect(Buffer.byteLength(JSON.stringify(rows))).toBeLessThan(4 * 1024 * 1024 + 1000);
});
