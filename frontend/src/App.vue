<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import {
  Database,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  Table2,
  Layers,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  MoreHorizontal,
  X,
  Plug,
  ArrowUpRight,
  LockKeyhole,
  Download,
  Server,
  Check,
  AlertCircle,
  LoaderCircle,
  Command,
  Settings2,
  LogOut,
  ExternalLink,
  Copy,
  KeyRound,
  Sun,
  Moon,
  WifiOff,
  LayoutGrid,
  Pencil,
  Trash2,
  Link2,
  Columns3,
  ArrowDownToLine,
  Info,
  GitFork,
} from 'lucide-vue-next';
import { useExplorerStore } from './application/stores/explorer.store';
import ConnectionDialog from './presentation/components/ConnectionDialog.vue';
import SchemaDiagram from './presentation/components/SchemaDiagram.vue';
import DataGrid from './presentation/components/DataGrid.vue';
import type { ConnectionSummary, TableInfo } from './domain/database.model';
const store = useExplorerStore();
const {
  connections,
  active,
  tables,
  selected,
  result,
  tabs,
  busy,
  connecting,
  error,
  locked,
  ready,
  config,
} = storeToRefs(store);
const dialog = ref(false),
  editing = ref<ConnectionSummary>(),
  tableFilter = ref(''),
  connectionFilter = ref(''),
  sidebar = ref(true),
  view = ref<'data' | 'structure' | 'query' | 'diagram'>('data'),
  accessToken = ref(''),
  unlocking = ref(false),
  menu = ref(''),
  confirmDelete = ref<ConnectionSummary>(),
  online = ref(navigator.onLine),
  installPrompt = ref<any>(null),
  toast = ref(''),
  about = ref(false);
const { needRefresh, updateServiceWorker } = useRegisterSW();
const theme = ref(localStorage.getItem('db-explorer-theme') === 'light' ? 'light' : 'dark');
const textSize = ref(
  [16, 18, 20].includes(Number(localStorage.getItem('db-explorer-text-size')))
    ? Number(localStorage.getItem('db-explorer-text-size'))
    : 16,
);
function applyTextSize() {
  document.documentElement.style.setProperty('--app-font-size', textSize.value + 'px');
  localStorage.setItem('db-explorer-text-size', String(textSize.value));
}
const diagramSchemas = computed(() => [
  ...new Set(tables.value.filter((t) => t.type === 'table').map((t) => t.schema)),
]);
function applyTheme() {
  document.documentElement.dataset.theme = theme.value;
  localStorage.setItem('db-explorer-theme', theme.value);
}
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  applyTheme();
}
const visibleConnections = computed(() =>
  connections.value.filter((c) =>
    (c.name + ' ' + c.host).toLowerCase().includes(connectionFilter.value.toLowerCase()),
  ),
);
const filteredTables = computed(() =>
  tables.value.filter((t) =>
    (t.schema + '.' + t.name).toLowerCase().includes(tableFilter.value.toLowerCase()),
  ),
);
const schemas = computed(() => [...new Set(filteredTables.value.map((t) => t.schema))]);
const collapsed = ref<string[]>([]);
function toggleSchema(name: string) {
  collapsed.value = collapsed.value.includes(name)
    ? collapsed.value.filter((n) => n !== name)
    : [...collapsed.value, name];
}
function same(a: TableInfo | null, b: TableInfo) {
  return a?.schema === b.schema && a?.name === b.name;
}
function newConnection() {
  editing.value = undefined;
  dialog.value = true;
}
async function saved(id: string) {
  dialog.value = false;
  await store.reloadConnections();
  await store.connect(id);
}
async function open(table: TableInfo) {
  view.value = 'data';
  await store.open(table);
}
function sortColumn(name: string) {
  store.direction = store.sort === name && store.direction === 'asc' ? 'desc' : 'asc';
  store.sort = name;
  store.page = 1;
  void store.load();
}
function filter() {
  store.page = 1;
  void store.load();
}
async function unlock() {
  unlocking.value = true;
  await store.unlock(accessToken.value);
  accessToken.value = '';
  unlocking.value = false;
}
async function remove() {
  if (!confirmDelete.value) return;
  try {
    await store.remove(confirmDelete.value.id);
    confirmDelete.value = undefined;
  } catch (e) {
    store.report(e);
  }
}
function notify(message: string) {
  toast.value = message;
  setTimeout(() => (toast.value = ''), 3500);
}
async function copySQL() {
  try {
    await navigator.clipboard.writeText(result.value?.sql ?? '');
    notify('Query copied');
  } catch {
    notify('Clipboard access is unavailable. Select the query to copy it.');
  }
}
function exportPage() {
  if (!result.value) return;
  const columns = result.value.columns.map((c) => c.name);
  const escape = (v: unknown) =>
    '"' +
    (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')).replace(
      /"/g,
      '""',
    ) +
    '"';
  const safe = (v: unknown) => {
    const s = typeof v === 'string' ? v : undefined;
    return escape(s && /^[=+@\-\t\r]/.test(s) ? "'" + s : v);
  };
  const csv = [
    columns.map(escape).join(','),
    ...result.value.rows.map((row) => columns.map((c) => safe(row[c])).join(',')),
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = (selected.value?.name ?? 'rows') + '-page-' + store.page + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  notify('Current page exported');
}
async function install() {
  if (installPrompt.value) {
    await installPrompt.value.prompt();
    installPrompt.value = null;
  }
}
function onInstall(event: Event) {
  event.preventDefault();
  installPrompt.value = event;
}
function updateNetwork() {
  online.value = navigator.onLine;
}
function keydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault();
    document.querySelector<HTMLInputElement>('#table-search')?.focus();
  }
  if (event.key === 'Escape') {
    dialog.value = false;
    about.value = false;
    menu.value = '';
    confirmDelete.value = undefined;
  }
}
onMounted(() => {
  applyTheme();
  applyTextSize();
  void store.initialize();
  window.addEventListener('beforeinstallprompt', onInstall);
  window.addEventListener('online', updateNetwork);
  window.addEventListener('offline', updateNetwork);
  window.addEventListener('keydown', keydown);
});
onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', onInstall);
  window.removeEventListener('online', updateNetwork);
  window.removeEventListener('offline', updateNetwork);
  window.removeEventListener('keydown', keydown);
});
</script>
<template>
  <div class="app-shell">
    <div v-if="!ready" class="boot-screen">
      <Database class="brand-mark" :size="38" /><LoaderCircle :size="20" class="spin" />
      <p>Opening your workspace…</p>
    </div>
    <main v-else-if="locked" class="unlock-screen">
      <div class="unlock-card">
        <div class="brand-lock"><Database :size="30" /></div>
        <span class="eyebrow">YOUR DATA. YOUR WORKSPACE.</span>
        <h1>Welcome to DB Explorer<span>.</span></h1>
        <p>A little clarity for all your databases.</p>
        <form @submit.prevent="unlock">
          <label
            >Workspace access token<input
              v-model="accessToken"
              type="password"
              placeholder="Enter your access token"
              autocomplete="current-password"
              required
          /></label>
          <p v-if="error" class="field-error" role="alert">{{ error }}</p>
          <button class="button primary" :disabled="unlocking">
            <LoaderCircle v-if="unlocking" class="spin" :size="16" /><LockKeyhole
              v-else
              :size="16"
            />{{ unlocking ? 'Unlocking…' : 'Open workspace' }}
          </button>
        </form>
        <p class="unlock-help">
          Using Docker? Your administrator provides this token.<br />The desktop app opens your
          workspace automatically.
        </p>
      </div>
      <span class="unlock-footer"
        ><ShieldCheck :size="14" />Read-only by design. Private by default.</span
      >
    </main>
    <template v-else>
      <header class="titlebar">
        <a href="/" class="brand" aria-label="DB Explorer home"
          ><span class="brand-icon"><Database :size="19" /></span><strong>DB Explorer</strong
          ><span class="beta-label">BETA</span></a
        >
        <div class="titlebar-center">
          <span class="workspace-dot" />Personal workspace<ChevronDown :size="12" />
        </div>
        <div class="titlebar-actions">
          <button
            v-if="installPrompt && config.mode === 'web'"
            class="text-button"
            @click="install"
          >
            <Download :size="14" />Install app</button
          ><span class="readonly-badge"><ShieldCheck :size="13" />Read-only</span
          ><button
            class="theme-toggle button secondary compact"
            :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
            @click="toggleTheme"
          >
            <Sun v-if="theme === 'dark'" :size="16" /><Moon v-else :size="16" />{{
              theme === 'dark' ? 'Light mode' : 'Dark mode'
            }}</button
          ><button class="avatar" aria-label="Workspace information" @click="about = true">
            DB
          </button>
        </div>
      </header>
      <div class="workbench">
        <aside v-if="sidebar" class="sidebar">
          <div class="sidebar-heading">
            <span>CONNECTIONS</span
            ><button
              class="icon-button"
              aria-label="New connection"
              title="New connection"
              @click="newConnection"
            >
              <Plus :size="17" />
            </button>
          </div>
          <div class="sidebar-search">
            <Search :size="14" /><input
              v-model="connectionFilter"
              aria-label="Find connections"
              placeholder="Find a connection…"
            />
          </div>
          <div class="connection-list">
            <div
              v-for="connection in visibleConnections"
              :key="connection.id"
              class="connection-item-wrap"
            >
              <button
                :class="['connection-item', { active: store.activeId === connection.id }]"
                @click="
                  tableFilter = '';
                  store.connect(connection.id);
                "
              >
                <span :class="['connection-symbol', connection.color]"><Database :size="17" /></span
                ><span class="connection-label"
                  ><strong>{{ connection.name }}</strong
                  ><small
                    >{{ connection.engine === 'postgresql' ? 'PostgreSQL' : 'MySQL' }}
                    <span>·</span> {{ connection.environment }}</small
                  ></span
                ><span v-if="store.activeId === connection.id" class="live-dot" /></button
              ><button
                class="connection-menu-button icon-button"
                :aria-label="'Options for ' + connection.name"
                @click="menu = menu === connection.id ? '' : connection.id"
              >
                <MoreHorizontal :size="17" />
              </button>
              <div v-if="menu === connection.id" class="context-menu">
                <button
                  @click="
                    editing = connection;
                    dialog = true;
                    menu = '';
                  "
                >
                  <Pencil :size="14" />Edit connection</button
                ><button
                  @click="
                    store.disconnect();
                    menu = '';
                  "
                  v-if="store.activeId === connection.id"
                >
                  <Plug :size="14" />Disconnect</button
                ><button
                  class="danger-text"
                  @click="
                    confirmDelete = connection;
                    menu = '';
                  "
                >
                  <Trash2 :size="14" />Remove connection
                </button>
              </div>
            </div>
            <p v-if="!connections.length" class="sidebar-empty">
              Your connections will<br />feel right at home here.
            </p>
            <p v-else-if="!visibleConnections.length" class="sidebar-empty">
              No matching connections.
            </p>
          </div>
          <button class="add-connection" @click="newConnection">
            <Plus :size="15" />New connection
          </button>
          <div class="objects-heading">
            <span>DATABASE EXPLORER</span
            ><button
              v-if="active"
              class="icon-button"
              aria-label="Refresh tables"
              @click="store.connect(active.id)"
            >
              <RefreshCw :size="13" :class="{ spin: connecting }" />
            </button>
          </div>
          <template v-if="active"
            ><div class="database-name">
              <Database :size="14" /><strong :title="active.database">{{ active.database }}</strong
              ><span>{{ tables.length }}</span>
            </div>
            <button
              class="diagram-nav"
              :class="{ selected: view === 'diagram' }"
              :disabled="connecting"
              @click="view = 'diagram'"
            >
              <GitFork :size="17" />Schema diagram<span>ERD</span>
            </button>
            <div class="sidebar-search table-search">
              <Search :size="13" /><input
                id="table-search"
                v-model="tableFilter"
                aria-label="Filter tables"
                placeholder="Filter tables…"
              /><kbd>⌘ K</kbd>
            </div>
            <div class="object-tree">
              <div v-if="connecting" class="tree-loading">
                <LoaderCircle class="spin" :size="15" />Loading tables…
              </div>
              <template v-else
                ><div v-for="schema in schemas" :key="schema" class="schema-group">
                  <button class="schema-heading" @click="toggleSchema(schema)">
                    <ChevronRight v-if="collapsed.includes(schema)" :size="13" /><ChevronDown
                      v-else
                      :size="13"
                    /><Layers :size="13" />{{ schema
                    }}<span>{{ filteredTables.filter((t) => t.schema === schema).length }}</span>
                  </button>
                  <div v-if="!collapsed.includes(schema)">
                    <button
                      v-for="table in filteredTables.filter((t) => t.schema === schema)"
                      :key="table.name"
                      :class="['table-item', { selected: same(selected, table) }]"
                      @click="open(table)"
                    >
                      <Table2 v-if="table.type === 'table'" :size="14" /><Columns3
                        v-else
                        :size="14"
                      /><span>{{ table.name }}</span
                      ><small v-if="table.estimatedRows !== null">{{
                        Number(table.estimatedRows).toLocaleString()
                      }}</small>
                    </button>
                  </div>
                </div>
                <p v-if="!filteredTables.length" class="sidebar-empty">
                  {{ tableFilter ? 'No tables match your search.' : 'No accessible tables found.' }}
                </p></template
              >
            </div></template
          >
          <div v-else class="tree-placeholder">
            <Layers :size="25" />
            <p>Connect a database to<br />explore its tables.</p>
          </div>
          <footer class="sidebar-footer">
            <button class="text-button" @click="about = true">
              <Settings2 :size="15" />Workspace settings</button
            ><button
              v-if="config.mode === 'web'"
              class="icon-button"
              aria-label="Lock workspace"
              @click="store.lock"
            >
              <LogOut :size="15" />
            </button>
          </footer>
        </aside>
        <main class="main-panel">
          <div class="tabbar">
            <button
              class="sidebar-toggle icon-button"
              :aria-label="sidebar ? 'Hide sidebar' : 'Show sidebar'"
              @click="sidebar = !sidebar"
            >
              <PanelLeftClose v-if="sidebar" :size="16" /><PanelLeftOpen v-else :size="16" />
            </button>
            <button
              v-if="active"
              class="diagram-tab"
              :class="{ active: view === 'diagram' }"
              @click="view = 'diagram'"
            >
              <GitFork :size="15" />Schema diagram
            </button>
            <div v-if="!tabs.length && view !== 'diagram'" class="welcome-tab">
              <LayoutGrid :size="14" />Overview
            </div>
            <div
              v-for="table in tabs"
              :key="table.schema + '.' + table.name"
              :class="['table-tab', { active: view !== 'diagram' && same(selected, table) }]"
            >
              <button @click="open(table)"><Table2 :size="14" />{{ table.name }}</button
              ><button
                class="tab-close"
                :aria-label="'Close ' + table.name"
                @click="store.closeTab(table)"
              >
                <X :size="12" />
              </button>
            </div>
          </div>
          <div v-if="needRefresh" class="update-banner">
            <RefreshCw :size="15" />A new version is ready.<button
              class="text-button"
              @click="updateServiceWorker()"
            >
              Update now
            </button>
          </div>
          <div v-if="!config.persistent" class="warning-banner">
            <AlertCircle :size="15" />Your system keychain is unavailable. Connections are kept for
            this session only.
          </div>
          <div v-if="error" class="error-banner" role="alert">
            <AlertCircle :size="17" /><span>{{ error }}</span
            ><button class="icon-button" aria-label="Dismiss error" @click="store.error = ''">
              <X :size="15" />
            </button>
          </div>
          <SchemaDiagram
            v-if="active && view === 'diagram'"
            :key="active.id"
            :connection-id="active.id"
            :schemas="diagramSchemas"
            :initial-schema="selected?.schema"
            :text-size="textSize"
            @open="open"
          />
          <template v-else-if="selected"
            ><header class="table-header">
              <div>
                <div class="breadcrumbs">
                  <span>{{ active?.name }}</span><ChevronRight :size="12" /><span>{{
                    selected.schema
                  }}</span
                  ><ChevronRight :size="12" /><strong>{{ selected.name }}</strong>
                </div>
                <h1>
                  <Table2 :size="22" />{{ selected.name
                  }}<span class="table-kind">{{ selected.type }}</span>
                </h1>
              </div>
              <div class="table-header-actions">
                <span class="readonly-note"><LockKeyhole :size="12" />Read-only connection</span
                ><button
                  class="button secondary compact"
                  :disabled="!result?.rows.length"
                  @click="exportPage"
                >
                  <ArrowDownToLine :size="14" />Export page
                </button>
              </div>
            </header>
            <div class="view-tabs">
              <button :class="{ active: view === 'data' }" @click="view = 'data'">
                <Table2 :size="14" />Data<span v-if="result">{{ result.rows.length }}</span></button
              ><button :class="{ active: view === 'structure' }" @click="view = 'structure'">
                <Columns3 :size="14" />Structure</button
              ><button :class="{ active: view === 'query' }" @click="view = 'query'">
                <Command :size="14" />Query preview
              </button>
            </div>
            <template v-if="view === 'data'"
              ><form class="data-toolbar" @submit.prevent="filter">
                <div class="filter-input">
                  <Search :size="15" /><input
                    v-model="store.search"
                    placeholder="Search this table…"
                    aria-label="Search table rows"
                  /><kbd>↵</kbd>
                </div>
                <select v-model="store.searchColumn" aria-label="Search column">
                  <option value="">All columns</option>
                  <option v-for="column in result?.columns" :key="column.name" :value="column.name">
                    {{ column.name }}
                  </option></select
                ><button class="button secondary compact" type="submit" :disabled="busy">
                  Apply filter
                </button>
                <div class="toolbar-spacer" />
                <button
                  class="icon-button"
                  type="button"
                  :disabled="busy"
                  aria-label="Refresh rows"
                  @click="store.load"
                >
                  <RefreshCw :size="16" :class="{ spin: busy }" />
                </button>
              </form>
              <div v-if="busy && !result" class="content-loading">
                <LoaderCircle class="spin" :size="26" />
                <p>Reading your table…</p>
              </div>
              <DataGrid
                v-else-if="result"
                :result="result"
                :sort="store.sort"
                :direction="store.direction"
                @sort="sortColumn"
              />
              <div v-else class="content-loading">
                <AlertCircle :size="26" />
                <p>Couldn't load this table.</p>
                <button class="button secondary" @click="store.load">Try again</button>
              </div>
              <footer class="grid-footer">
                <span v-if="result"
                  ><span class="status-dot" />{{ result.rows.length.toLocaleString() }} rows shown
                  <span class="footer-separator">·</span>{{ result.elapsedMs }} ms<span v-if="busy">
                    · Refreshing…</span
                  ></span
                ><span v-else />
                <div class="pagination">
                  <label
                    >Rows per page<select
                      v-model.number="store.limit"
                      aria-label="Rows per page"
                      @change="
                        store.page = 1;
                        store.load();
                      "
                    >
                      <option :value="50">50</option>
                      <option :value="100">100</option>
                      <option :value="250">250</option>
                      <option :value="1000">1000</option>
                    </select></label
                  ><button
                    class="icon-button"
                    aria-label="First page"
                    :disabled="store.page === 1 || busy"
                    @click="
                      store.page = 1;
                      store.load();
                    "
                  >
                    <ChevronsLeft :size="15" /></button
                  ><button
                    class="icon-button"
                    aria-label="Previous page"
                    :disabled="store.page === 1 || busy"
                    @click="
                      store.page--;
                      store.load();
                    "
                  >
                    <ChevronLeft :size="15" /></button
                  ><span>Page {{ store.page }}</span
                  ><button
                    class="icon-button"
                    aria-label="Next page"
                    :disabled="!result?.hasMore || busy || result?.truncated"
                    @click="
                      store.page++;
                      store.load();
                    "
                  >
                    <ChevronRight :size="15" />
                  </button>
                </div>
              </footer>
              <div v-if="result && (!result.stableOrder || result.truncated)" class="grid-warning">
                <Info :size="13" />{{
                  result.truncated
                    ? 'Result size limit reached. Reduce rows per page or narrow your filter.'
                    : 'This table has no primary key. Row order may change between pages.'
                }}
              </div></template
            >
            <div v-else-if="view === 'structure'" class="structure-view">
              <table class="structure-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Nullable</th>
                    <th>Default</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="column in result?.columns" :key="column.name">
                    <td>
                      <KeyRound v-if="column.primaryKey" :size="13" class="key-icon" />{{
                        column.name
                      }}
                    </td>
                    <td class="mono muted">{{ column.type }}</td>
                    <td>
                      <span :class="['small-pill', { yes: column.nullable }]">{{
                        column.nullable ? 'YES' : 'NO'
                      }}</span>
                    </td>
                    <td class="mono muted">{{ column.defaultValue ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="!result" class="muted">
                Load this table successfully to view its structure.
              </p>
            </div>
            <div v-else class="query-view">
              <div class="query-label">
                <span>GENERATED READ-ONLY QUERY</span
                ><button class="button secondary compact" @click="copySQL">
                  <Copy :size="14" />Copy
                </button>
              </div>
              <pre>{{ result?.sql ?? 'Load a table to preview its query.' }}</pre>
              <p>
                <ShieldCheck :size="15" />Search values are bound separately. This preview is for
                inspection; arbitrary SQL execution is disabled.
              </p>
            </div>
          </template>
          <section v-else class="welcome-view">
            <div class="welcome-topline">
              <span class="eyebrow">A LITTLE CLARITY FOR YOUR DATA</span
              ><span class="welcome-version">WORKSPACE / 01</span>
            </div>
            <div class="welcome-content">
              <div class="hero-art">
                <div class="orbit orbit-one" />
                <div class="orbit orbit-two" />
                <div class="hero-database"><Database :size="44" :stroke-width="1.2" /></div>
                <span class="art-node node-one"><Table2 :size="18" /></span
                ><span class="art-node node-two"><ShieldCheck :size="17" /></span
                ><span class="art-spark" />
              </div>
              <span class="eyebrow">MEET YOUR NEW WORKSPACE</span>
              <h1>Your databases.<br /><span>A clearer view.</span></h1>
              <p>
                From local experiments to production insights.<br />Explore your data in a space
                that stays out of your way.
              </p>
              <button class="button primary welcome-cta" @click="newConnection">
                <Plus :size="17" />Add a connection<ArrowUpRight :size="16" /></button
              ><span class="welcome-support"
                >PostgreSQL & MySQL <span>·</span> Local & remote <span>·</span> SSH & TLS</span
              >
            </div>
            <div class="welcome-cards">
              <article>
                <span class="feature-symbol"><Layers :size="19" /></span>
                <h3>Everything in its place</h3>
                <p>Browse schemas, inspect columns, and move between tables with ease.</p>
              </article>
              <article>
                <span class="feature-symbol"><ShieldCheck :size="19" /></span>
                <h3>Explore with confidence</h3>
                <p>A read-only workspace keeps your production data untouched.</p>
              </article>
              <article>
                <span class="feature-symbol"><KeyRound :size="19" /></span>
                <h3>Your secrets stay yours</h3>
                <p>Encrypted connections. Verified tunnels. No data sent to a third party.</p>
              </article>
            </div>
            <div class="welcome-bottom">
              <span
                ><span class="status-dot" />{{
                  active ? 'Connected to ' + active.name : 'Ready when you are'
                }}</span
              ><span>Built for a little more focus.</span>
            </div>
          </section>
        </main>
      </div>
      <footer class="statusbar">
        <span
          ><span :class="['status-dot', { offline: !online }]" />{{
            active ? active.host + ':' + active.port : 'No active connection'
          }}<span v-if="active?.ssh" class="status-extra"
            ><LockKeyhole :size="11" />SSH tunnel</span
          ></span
        ><span
          ><span v-if="!online" class="status-extra"
            ><WifiOff :size="12" />Offline · local databases still available</span
          ><ShieldCheck :size="11" />Read-only<span class="status-divider" />{{
            config.mode === 'desktop' ? 'Desktop' : 'Web workspace'
          }}<span class="status-divider" />v{{ config.version }}</span
        >
      </footer>
    </template>
    <ConnectionDialog v-if="dialog" :connection="editing" @close="dialog = false" @saved="saved" />
    <div v-if="confirmDelete" class="modal-backdrop" @click.self="confirmDelete = undefined">
      <section
        class="dialog confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
      >
        <h2 id="delete-title">Remove {{ confirmDelete.name }}?</h2>
        <p>This removes the saved connection and its credentials. Your database stays untouched.</p>
        <div class="confirm-actions">
          <button class="button secondary" @click="confirmDelete = undefined">
            Keep connection</button
          ><button class="button danger" @click="remove">Remove connection</button>
        </div>
      </section>
    </div>
    <div v-if="about" class="modal-backdrop" @click.self="about = false">
      <section
        class="dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <header class="dialog-header">
          <Database :size="23" />
          <h2 id="about-title">Your workspace</h2>
          <button class="icon-button" aria-label="Close workspace settings" @click="about = false">
            <X :size="18" />
          </button>
        </header>
        <div class="dialog-body">
          <p>
            DB Explorer <strong>v{{ config.version }}</strong>
          </p>
          <p class="muted">A focused, read-only workspace for PostgreSQL and MySQL.</p>
          <dl>
            <dt>Running as</dt>
            <dd>
              {{
                config.mode === 'desktop'
                  ? 'Desktop app · everything included'
                  : 'Web app · server-managed connections'
              }}
            </dd>
            <dt>Connection storage</dt>
            <dd>
              {{
                config.persistent
                  ? 'Encrypted on this device or server'
                  : 'Session only · system keychain unavailable'
              }}
            </dd>
            <dt>Localhost means</dt>
            <dd>
              {{
                config.mode === 'desktop'
                  ? 'Your own computer'
                  : 'The backend host. In Docker, use host.docker.internal for the Docker host.'
              }}
            </dd>
            <dt>Privacy</dt>
            <dd>
              Database results and passwords are never cached by the PWA. This web workspace is
              single-user; everyone with its token can access its saved connections.
            </dd>
          </dl>
          <label class="text-size-setting"
            >Text size<select
              v-model.number="textSize"
              aria-label="Text size"
              @change="applyTextSize"
            >
              <option :value="16">Comfortable</option>
              <option :value="18">Large</option>
              <option :value="20">Extra large</option>
            </select></label
          >
          <button class="button secondary" @click="toggleTheme">
            <Sun :size="15" />Switch to {{ theme === 'dark' ? 'light' : 'dark' }} theme
          </button>
        </div>
      </section>
    </div>
    <div v-if="toast" class="toast" role="status"><Check :size="15" />{{ toast }}</div>
  </div>
</template>
