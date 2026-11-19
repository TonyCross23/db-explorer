export const quoteIdentifier = (engine: 'mysql' | 'postgresql', name: string) =>
  engine === 'mysql' ? '`' + name.replace(/`/g, '``') + '`' : '"' + name.replace(/"/g, '""') + '"';
export function encodeCell(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value))
    return (
      '[binary] ' + value.subarray(0, 256).toString('base64') + (value.length > 256 ? '…' : '')
    );
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 8192)
    return value.slice(0, 8192) + '… [truncated]';
  return value;
}
export function safeRows(rows: Record<string, unknown>[]) {
  let bytes = 0,
    truncated = false;
  const result: Record<string, unknown>[] = [];
  for (const row of rows) {
    const encoded = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, encodeCell(v)]));
    const size = Buffer.byteLength(JSON.stringify(encoded));
    if (bytes + size > 4 * 1024 * 1024) {
      truncated = true;
      break;
    }
    bytes += size;
    result.push(encoded);
  }
  return { rows: result, truncated };
}
