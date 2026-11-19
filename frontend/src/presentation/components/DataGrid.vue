<script setup lang="ts">
import { ref, computed } from 'vue';
import { KeyRound, ArrowUp, ArrowDown, Copy, X, Check, Columns3 } from 'lucide-vue-next';
import type { RowResult } from '../../domain/database.model';
const props = defineProps<{ result: RowResult; sort: string; direction: 'asc' | 'desc' }>();
const emit = defineEmits<{ sort: [name: string] }>();
const detail = ref<{ column: string; value: unknown } | null>(null),
  copied = ref(false);
const cell = (value: unknown) =>
  value === null ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
const detailText = computed(() =>
  typeof detail.value?.value === 'object'
    ? JSON.stringify(detail.value?.value, null, 2)
    : cell(detail.value?.value),
);
async function copy() {
  try {
    await navigator.clipboard.writeText(detailText.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    copied.value = false;
  }
}
</script>
<template>
  <div class="grid-scroll">
    <table class="data-grid">
      <thead>
        <tr>
          <th class="row-index">#</th>
          <th
            v-for="column in result.columns"
            :key="column.name"
            :aria-sort="
              sort === column.name ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
            "
          >
            <button @click="emit('sort', column.name)">
              <span class="column-name"
                ><KeyRound v-if="column.primaryKey" :size="12" class="key-icon" />{{ column.name
                }}<ArrowUp
                  v-if="sort === column.name && direction === 'asc'"
                  :size="13" /><ArrowDown
                  v-if="sort === column.name && direction === 'desc'"
                  :size="13" /></span
              ><span class="column-type">{{ column.type }}</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in result.rows" :key="index">
          <td class="row-index">{{ (result.page - 1) * result.limit + index + 1 }}</td>
          <td
            v-for="column in result.columns"
            :key="column.name"
            :class="{
              'null-cell': row[column.name] === null,
              'numeric-cell': /int|numeric|decimal|float|double|real/.test(column.type),
            }"
          >
            <button
              class="cell-content"
              @dblclick="detail = { column: column.name, value: row[column.name] }"
              @keydown.enter="detail = { column: column.name, value: row[column.name] }"
              :title="'Double-click to inspect ' + column.name"
            >
              {{ cell(row[column.name]) }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!result.rows.length" class="table-empty">
      <Columns3 :size="30" />
      <h3>No rows found</h3>
      <p>Try another filter, or choose a different table.</p>
    </div>
  </div>
  <div v-if="detail" class="modal-backdrop" @click.self="detail = null">
    <section
      class="dialog cell-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Cell value"
      @keydown.esc="detail = null"
    >
      <header class="dialog-header">
        <h2>{{ detail.column }}</h2>
        <button class="icon-button" aria-label="Close cell value" @click="detail = null">
          <X :size="18" />
        </button>
      </header>
      <pre>{{ detailText }}</pre>
      <footer class="dialog-footer">
        <span class="muted">Cell value · read only</span
        ><button class="button secondary" @click="copy">
          <Check v-if="copied" :size="15" /><Copy v-else :size="15" />{{
            copied ? 'Copied' : 'Copy value'
          }}
        </button>
      </footer>
    </section>
  </div>
</template>
