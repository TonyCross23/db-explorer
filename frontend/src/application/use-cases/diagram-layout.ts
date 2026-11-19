import type { DiagramTable, DiagramRelationship } from '../../domain/database.model';
export const tableKey = (schema: string, name: string) => JSON.stringify([schema, name]);
export type PositionedTable = {
  table: DiagramTable;
  x: number;
  y: number;
  width: number;
  height: number;
};
/** Connected components use breadth-first layers; cycles and self-links remain finite. */
export function layoutDiagram(
  tables: DiagramTable[],
  relationships: DiagramRelationship[],
  unit = 1,
): PositionedTable[] {
  const width = 324 * unit,
    gap = 112 * unit,
    margin = 40 * unit;
  const byId = new Map(tables.map((t) => [tableKey(t.schema, t.name), t]));
  const neighbors = new Map([...byId.keys()].map((k) => [k, new Set<string>()]));
  for (const r of relationships) {
    const a = tableKey(r.from.schema, r.from.table),
      b = tableKey(r.to.schema, r.to.table);
    if (a !== b && byId.has(a) && byId.has(b)) {
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
  }
  const remaining = new Set(byId.keys()),
    output: PositionedTable[] = [];
  let componentY = margin;
  while (remaining.size) {
    const root = [...remaining].sort(
      (a, b) => neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b),
    )[0]!;
    if (neighbors.get(root)!.size === 0) {
      const isolated = [...remaining].sort();
      let x = 0,
        y = componentY,
        rowHeight = 0;
      for (const id of isolated) {
        const table = byId.get(id)!,
          height = cardHeight(table, unit);
        output.push({ table, x: margin + x * (width + gap), y, width, height });
        rowHeight = Math.max(rowHeight, height);
        remaining.delete(id);
        if (++x === 3) {
          x = 0;
          y += rowHeight + gap;
          rowHeight = 0;
        }
      }
      break;
    }
    const layers = new Map<number, string[]>(),
      queue: [string, number][] = [[root, 0]];
    remaining.delete(root);
    for (let i = 0; i < queue.length; i++) {
      const [id, depth] = queue[i]!;
      const layer = layers.get(depth) ?? [];
      layer.push(id);
      layers.set(depth, layer);
      for (const next of [...neighbors.get(id)!].sort())
        if (remaining.delete(next)) queue.push([next, depth + 1]);
    }
    let bottom = componentY;
    for (const [depth, ids] of layers) {
      let y = componentY;
      for (const id of ids) {
        const table = byId.get(id)!,
          height = cardHeight(table, unit);
        output.push({ table, x: margin + depth * (width + gap), y, width, height });
        y += height + gap;
      }
      bottom = Math.max(bottom, y);
    }
    componentY = bottom;
  }
  return output;
}
export const cardHeight = (table: DiagramTable, unit = 1) =>
  (58 + Math.min(12, table.columns.length) * 29 + (table.columns.length > 12 ? 30 : 10)) * unit;
