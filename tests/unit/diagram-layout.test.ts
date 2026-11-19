import { describe, it, expect } from 'vitest';
import { layoutDiagram, tableKey } from '../../frontend/src/application/use-cases/diagram-layout';
import type { DiagramTable, DiagramRelationship } from '@db-explorer/shared';
const table = (name: string, count = 2): DiagramTable => ({
  schema: 'public',
  name,
  columns: Array.from({ length: count }, (_, i) => ({
    name: 'c' + i,
    type: 'integer',
    nullable: false,
    primaryKey: i === 0,
  })),
});
const relation = (a: string, b: string): DiagramRelationship => ({
  name: a + b,
  from: { schema: 'public', table: a, columns: ['c0'] },
  to: { schema: 'public', table: b, columns: ['c0'] },
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION',
});
describe('diagram layout', () => {
  it('places cyclic, self-referencing and disconnected graphs without overlaps', () => {
    const tables = [table('a', 40), table('b'), table('c'), table('d'), table('e'), table('f')];
    const links = [relation('a', 'b'), relation('b', 'c'), relation('c', 'a'), relation('a', 'a')];
    const nodes = layoutDiagram(tables, links);
    expect(nodes).toHaveLength(tables.length);
    for (const a of nodes) {
      expect(Number.isFinite(a.x + a.y + a.width + a.height)).toBe(true);
      for (const b of nodes)
        if (a !== b)
          expect(
            a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y,
          ).toBe(true);
    }
    expect(layoutDiagram(tables, links)).toEqual(nodes);
  });
  it('keeps dotted identifiers distinct and scales for larger text', () => {
    expect(tableKey('a.b', 'c')).not.toBe(tableKey('a', 'b.c'));
    const normal = layoutDiagram([table('a')], [])[0]!,
      large = layoutDiagram([table('a')], [], 1.25)[0]!;
    expect(large.width).toBe(normal.width * 1.25);
    expect(large.height).toBe(normal.height * 1.25);
    expect(layoutDiagram([], [])).toEqual([]);
  });
});
