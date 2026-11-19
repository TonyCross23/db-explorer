<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import {
  GitFork,
  Search,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize,
  LoaderCircle,
  AlertCircle,
  KeyRound,
  Link2,
  X,
  Table2,
} from 'lucide-vue-next';
import { useExplorerStore } from '../../application/stores/explorer.store';
import {
  layoutDiagram,
  tableKey,
  type PositionedTable,
} from '../../application/use-cases/diagram-layout';
import type { DiagramTable, TableInfo } from '../../domain/database.model';
const props = defineProps<{
  connectionId: string;
  schemas: string[];
  initialSchema?: string;
  textSize: number;
}>();
const emit = defineEmits<{ open: [table: TableInfo] }>();
const store = useExplorerStore();
const schema = ref(props.initialSchema ?? props.schemas[0] ?? ''),
  filter = ref(''),
  zoom = ref(1),
  viewport = ref<HTMLDivElement>(),
  selected = ref('');
const offsets = ref<Record<string, { x: number; y: number }>>({});
const unit = computed(() => props.textSize / 16);
const data = computed(() => store.diagram),
  loading = computed(() => store.diagramBusy),
  error = computed(() => store.diagramError);
const matching = computed(
  () =>
    data.value?.tables.filter((t) => t.name.toLowerCase().includes(filter.value.toLowerCase())) ??
    [],
);
const positioned = computed(() =>
  layoutDiagram(matching.value, data.value?.relationships ?? [], unit.value).map((node) => ({
    ...node,
    ...offsets.value[tableKey(node.table.schema, node.table.name)],
  })),
);
const index = computed(
  () => new Map(positioned.value.map((n) => [tableKey(n.table.schema, n.table.name), n])),
);
const relationships = computed(() =>
  (data.value?.relationships ?? []).filter(
    (r) =>
      index.value.has(tableKey(r.from.schema, r.from.table)) &&
      index.value.has(tableKey(r.to.schema, r.to.table)),
  ),
);
const width = computed(() =>
  Math.max(700, ...positioned.value.map((n) => n.x + n.width + 80 * unit.value)),
);
const height = computed(() =>
  Math.max(400, ...positioned.value.map((n) => n.y + n.height + 80 * unit.value)),
);
const chosen = computed(() =>
  data.value?.tables.find((t) => tableKey(t.schema, t.name) === selected.value),
);
const chosenLinks = computed(() =>
  (data.value?.relationships ?? []).filter(
    (r) =>
      tableKey(r.from.schema, r.from.table) === selected.value ||
      tableKey(r.to.schema, r.to.table) === selected.value,
  ),
);
function isForeign(table: DiagramTable, column: string) {
  return data.value?.relationships.some(
    (r) =>
      r.from.schema === table.schema &&
      r.from.table === table.name &&
      r.from.columns.includes(column),
  );
}
function anchor(node: PositionedTable, column: string) {
  const i = node.table.columns.findIndex((c) => c.name === column);
  return node.y + (i >= 0 && i < 12 ? 58 + i * 29 + 14 : 29) * unit.value;
}
const edges = computed(() =>
  relationships.value.map((r, i) => {
    const a = index.value.get(tableKey(r.from.schema, r.from.table))!,
      b = index.value.get(tableKey(r.to.schema, r.to.table))!;
    const forward = a.x < b.x;
    const x1 = forward ? a.x + a.width : a.x,
      x2 = forward ? b.x : b.x + b.width,
      y1 = anchor(a, r.from.columns[0] ?? ''),
      y2 = anchor(b, r.to.columns[0] ?? '');
    const bend = Math.max(50 * unit.value, Math.abs(x2 - x1) * 0.45);
    const self = a === b;
    const d = self
      ? `M ${a.x + a.width} ${y1} C ${a.x + a.width + 70 * unit.value} ${y1},${a.x + a.width + 70 * unit.value} ${y2 - 50 * unit.value},${a.x + a.width} ${y2}`
      : `M ${x1} ${y1} C ${x1 + (forward ? bend : -bend)} ${y1},${x2 + (forward ? -bend : bend)} ${y2},${x2} ${y2}`;
    return {
      key: i,
      d,
      relation: r,
      active:
        !selected.value ||
        selected.value === tableKey(r.from.schema, r.from.table) ||
        selected.value === tableKey(r.to.schema, r.to.table),
    };
  }),
);
async function load() {
  if (!schema.value) return;
  selected.value = '';
  offsets.value = {};
  await store.loadDiagram(props.connectionId, schema.value);
  await nextTick();
  fit(0.85);
}
function fit(minimum = 0.15) {
  if (!viewport.value || !positioned.value.length) return;
  zoom.value = Math.max(
    minimum,
    Math.min(
      1,
      (viewport.value.clientWidth - 40) / width.value,
      (viewport.value.clientHeight - 40) / height.value,
    ),
  );
  viewport.value.scrollTo(0, 0);
}
function setZoom(value: number) {
  zoom.value = Math.min(2.5, Math.max(0.15, value));
}
function wheel(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    setZoom(zoom.value * (event.deltaY < 0 ? 1.1 : 0.9));
  }
}
let drag:
  | { kind: 'pan' | 'node'; id?: string; x: number; y: number; left: number; top: number }
  | undefined;
function startPan(event: PointerEvent) {
  if (event.button !== 0 || (event.target as Element).closest('[data-erd-table]')) return;
  const el = viewport.value!;
  drag = {
    kind: 'pan',
    x: event.clientX,
    y: event.clientY,
    left: el.scrollLeft,
    top: el.scrollTop,
  };
  el.setPointerCapture(event.pointerId);
}
function startNode(event: PointerEvent, node: PositionedTable) {
  if (event.button !== 0) return;
  event.stopPropagation();
  selected.value = tableKey(node.table.schema, node.table.name);
  drag = {
    kind: 'node',
    id: selected.value,
    x: event.clientX,
    y: event.clientY,
    left: node.x,
    top: node.y,
  };
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!drag || !viewport.value) return;
  if (drag.kind === 'pan') {
    viewport.value.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.value.scrollTop = drag.top - (event.clientY - drag.y);
  } else {
    offsets.value = {
      ...offsets.value,
      [drag.id!]: {
        x: Math.max(16, drag.left + (event.clientX - drag.x) / zoom.value),
        y: Math.max(16, drag.top + (event.clientY - drag.y) / zoom.value),
      },
    };
  }
}
function stop() {
  drag = undefined;
}
function open(table: DiagramTable) {
  emit('open', { schema: table.schema, name: table.name, type: 'table', estimatedRows: null });
}
watch(
  () => props.connectionId,
  () => {
    schema.value = props.initialSchema ?? props.schemas[0] ?? '';
    void load();
  },
  { immediate: true },
);
watch(
  () => props.schemas,
  (values) => {
    if (!schema.value && values.length) {
      schema.value = values[0]!;
      void load();
    }
  },
);
watch(filter, async () => {
  offsets.value = {};
  await nextTick();
  fit(0.85);
});
watch(
  () => props.textSize,
  async () => {
    offsets.value = {};
    await nextTick();
    fit();
  },
);
</script>
<template>
  <section class="erd-view" aria-label="Database relationship diagram">
    <header class="erd-header">
      <div>
        <span class="eyebrow">DATABASE MAP</span>
        <h1><GitFork :size="24" />Schema diagram</h1>
        <p>Explore how your tables connect. Generated from database keys.</p>
      </div>
      <button class="button secondary compact" :disabled="loading || !schema" @click="load">
        <RefreshCw :size="16" :class="{ spin: loading }" />Refresh diagram
      </button>
    </header>
    <div class="erd-toolbar">
      <label
        >Schema<select v-model="schema" aria-label="Diagram schema" @change="load">
          <option v-for="name in schemas" :key="name">{{ name }}</option>
        </select></label
      >
      <div class="filter-input">
        <Search :size="16" /><input
          v-model="filter"
          aria-label="Find table in diagram"
          placeholder="Find a table…"
        />
      </div>
      <span class="erd-count"
        >{{ matching.length }} tables · {{ relationships.length }} relationships</span
      >
      <div class="erd-zoom">
        <button class="icon-button" aria-label="Zoom out diagram" @click="setZoom(zoom - 0.15)">
          <ZoomOut :size="18" /></button
        ><span>{{ Math.round(zoom * 100) }}%</span
        ><button class="icon-button" aria-label="Zoom in diagram" @click="setZoom(zoom + 0.15)">
          <ZoomIn :size="18" /></button
        ><button class="icon-button" aria-label="Fit diagram" @click="fit()">
          <Maximize :size="17" /></button
        ><button
          class="text-button"
          @click="
            offsets = {};
            fit();
          "
        >
          Auto layout
        </button>
      </div>
    </div>
    <div v-if="loading" class="content-loading">
      <LoaderCircle :size="28" class="spin" />
      <p>Reading your database structure…</p>
    </div>
    <div v-else-if="error" class="content-loading" role="alert">
      <AlertCircle :size="28" />
      <p>{{ error }}</p>
      <button class="button secondary" @click="load">Try again</button>
    </div>
    <div v-else-if="!positioned.length" class="content-loading">
      <GitFork :size="32" />
      <h2>{{ filter ? 'No matching tables' : 'No accessible tables in this schema' }}</h2>
      <p>{{ filter ? 'Try another table name.' : 'Choose a schema with tables you can read.' }}</p>
    </div>
    <div v-else class="erd-workspace">
      <div
        ref="viewport"
        class="erd-viewport"
        tabindex="0"
        aria-label="Scrollable relationship diagram. Drag the background to pan; control plus wheel to zoom."
        @pointerdown="startPan"
        @pointermove="move"
        @pointerup="stop"
        @pointercancel="stop"
        @lostpointercapture="stop"
        @wheel="wheel"
      >
        <div :style="{ width: width * zoom + 'px', height: height * zoom + 'px' }">
          <svg
            class="erd-canvas"
            :width="width"
            :height="height"
            :style="{ transform: `scale(${zoom})` }"
            role="img"
            :aria-label="`${schema} schema: ${matching.length} tables and ${relationships.length} relationships`"
          >
            <defs>
              <marker
                id="erd-reference"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
              </marker>
            </defs>
            <g class="erd-relationships">
              <path
                v-for="edge in edges"
                :key="edge.key"
                :d="edge.d"
                fill="none"
                stroke="var(--accent)"
                :stroke-width="edge.active ? 2 : 1"
                :opacity="edge.active ? 0.75 : 0.16"
                marker-end="url(#erd-reference)"
              >
                <title>
                  {{ edge.relation.name }}: {{ edge.relation.from.table }}.{{
                    edge.relation.from.columns.join(', ')
                  }}
                  → {{ edge.relation.to.table }}.{{ edge.relation.to.columns.join(', ') }} · DELETE
                  {{ edge.relation.onDelete }}
                </title>
              </path>
            </g>
            <g
              v-for="node in positioned"
              :key="tableKey(node.table.schema, node.table.name)"
              data-erd-table
              role="button"
              tabindex="0"
              :aria-label="`Inspect diagram table ${node.table.name}`"
              :aria-pressed="selected === tableKey(node.table.schema, node.table.name)"
              :transform="`translate(${node.x},${node.y})`"
              class="erd-table"
              @pointerdown="startNode($event, node)"
              @dblclick="open(node.table)"
              @keydown.enter="selected = tableKey(node.table.schema, node.table.name)"
              @keydown.space.prevent="selected = tableKey(node.table.schema, node.table.name)"
            >
              <rect
                :width="node.width"
                :height="node.height"
                :rx="10 * unit"
                fill="var(--panel)"
                :stroke="
                  selected === tableKey(node.table.schema, node.table.name)
                    ? 'var(--accent)'
                    : 'var(--line)'
                "
                :stroke-width="selected === tableKey(node.table.schema, node.table.name) ? 2 : 1"
              />
              <rect
                :width="node.width"
                :height="55 * unit"
                :rx="10 * unit"
                fill="var(--elevated)"
              />
              <line :x2="node.width" :y1="55 * unit" :y2="55 * unit" stroke="var(--line)" />
              <text
                :x="16 * unit"
                :y="24 * unit"
                :font-size="16 * unit"
                font-weight="650"
                fill="var(--text)"
              >
                {{
                  node.table.name.length > 29 ? node.table.name.slice(0, 28) + '…' : node.table.name
                }}
                <title>{{ node.table.name }}</title>
              </text>
              <text :x="16 * unit" :y="43 * unit" :font-size="12 * unit" fill="var(--muted)">
                {{ node.table.schema }} · {{ node.table.columns.length }} columns
              </text>
              <g
                v-for="(column, i) in node.table.columns.slice(0, 12)"
                :key="column.name"
                :transform="`translate(0,${(58 + i * 29) * unit})`"
              >
                <rect
                  v-if="column.primaryKey || isForeign(node.table, column.name)"
                  :x="8 * unit"
                  :width="(324 - 16) * unit"
                  :height="27 * unit"
                  :rx="4 * unit"
                  fill="var(--accent-dark)"
                  opacity=".6"
                />
                <text :x="15 * unit" :y="19 * unit" :font-size="11 * unit" fill="var(--accent)">
                  {{ column.primaryKey ? 'PK' : isForeign(node.table, column.name) ? 'FK' : '·' }}
                </text>
                <text :x="42 * unit" :y="19 * unit" :font-size="14 * unit" fill="var(--text)">
                  {{ column.name.length > 21 ? column.name.slice(0, 20) + '…' : column.name }}
                  <title>
                    {{ column.name }} · {{ column.type }} ·
                    {{ column.nullable ? 'nullable' : 'required' }}
                  </title>
                </text>
                <text
                  :x="309 * unit"
                  :y="19 * unit"
                  text-anchor="end"
                  :font-size="12 * unit"
                  fill="var(--muted)"
                >
                  {{ column.type.length > 13 ? column.type.slice(0, 12) + '…' : column.type }}
                </text>
              </g>
              <text
                v-if="node.table.columns.length > 12"
                :x="16 * unit"
                :y="(58 + 12 * 29 + 20) * unit"
                :font-size="12 * unit"
                fill="var(--muted)"
              >
                + {{ node.table.columns.length - 12 }} more columns · select to inspect
              </text>
            </g>
          </svg>
        </div>
      </div>
      <aside v-if="chosen" class="erd-inspector" aria-label="Diagram table details">
        <header>
          <div>
            <span class="eyebrow">TABLE DETAILS</span>
            <h2>{{ chosen.name }}</h2>
            <p>{{ chosen.schema }}</p>
          </div>
          <button class="icon-button" aria-label="Close diagram details" @click="selected = ''">
            <X :size="18" />
          </button>
        </header>
        <button class="button secondary compact" @click="open(chosen)">
          <Table2 :size="15" />Browse table data
        </button>
        <h3>
          Columns <span>{{ chosen.columns.length }}</span>
        </h3>
        <div v-for="column in chosen.columns" :key="column.name" class="erd-detail-column">
          <div>
            <KeyRound v-if="column.primaryKey" :size="14" class="key-icon" /><Link2
              v-else-if="isForeign(chosen, column.name)"
              :size="14"
            /><strong>{{ column.name }}</strong>
          </div>
          <small>{{ column.type }} · {{ column.nullable ? 'nullable' : 'required' }}</small>
        </div>
        <h3>
          Relationships <span>{{ chosenLinks.length }}</span>
        </h3>
        <p v-if="!chosenLinks.length" class="muted">No declared foreign keys for this table.</p>
        <article v-for="(link, i) in chosenLinks" :key="i" class="erd-detail-link">
          <strong>{{ link.name }}</strong>
          <p>
            {{ link.from.schema }}.{{ link.from.table }} ({{ link.from.columns.join(', ') }}) →
            {{ link.to.schema }}.{{ link.to.table }} ({{ link.to.columns.join(', ') }})
          </p>
          <small>On delete: {{ link.onDelete }} · On update: {{ link.onUpdate }}</small>
        </article>
      </aside>
    </div>
    <footer class="erd-footer">
      <span
        ><KeyRound :size="13" />PK primary key <Link2 :size="13" />FK foreign key
        <span>· Arrow points to the referenced table</span></span
      ><span>Drag tables to arrange · Double-click to browse</span>
    </footer>
    <p v-if="data?.truncated" class="grid-warning">
      <AlertCircle :size="14" />Showing a bounded diagram: up to 100 tables, 5,000 columns and 2,000
      foreign-key columns. Some metadata is omitted.
    </p>
    <p v-if="data?.externalRelationships" class="grid-warning">
      {{ data.externalRelationships }} relationships point to tables outside this diagram. Select a
      table to see their details.
    </p>
    <p v-if="data && !data.relationships.length && !loading && !error" class="erd-hint">
      No foreign keys are declared in this schema. Tables are shown without inferred relationship
      lines.
    </p>
  </section>
</template>
