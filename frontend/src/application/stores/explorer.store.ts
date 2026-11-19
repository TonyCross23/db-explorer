import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  ConnectionSummary,
  TableInfo,
  RowResult,
  SchemaDiagram,
} from '../../domain/database.model';
import { api, ApiError, setToken } from '../../infrastructure/api/explorer.api';
export const useExplorerStore = defineStore('explorer', () => {
  const connections = ref<ConnectionSummary[]>([]),
    activeId = ref(''),
    tables = ref<TableInfo[]>([]),
    selected = ref<TableInfo | null>(null),
    result = ref<RowResult | null>(null);
  const tabs = ref<TableInfo[]>([]),
    busy = ref(false),
    connecting = ref(false),
    error = ref(''),
    notice = ref(''),
    locked = ref(true),
    ready = ref(false),
    page = ref(1),
    limit = ref(100),
    search = ref(''),
    searchColumn = ref(''),
    sort = ref(''),
    direction = ref<'asc' | 'desc'>('asc');
  const config = ref({
    mode: 'web' as 'web' | 'desktop',
    persistent: true,
    readOnly: true,
    version: '0.2.0',
  });
  const diagram = ref<SchemaDiagram | null>(null),
    diagramBusy = ref(false),
    diagramError = ref('');
  let diagramRequest = 0;
  let connectionRequest = 0,
    rowRequest = 0;
  const active = computed(() => connections.value.find((c) => c.id === activeId.value));
  function report(e: unknown) {
    error.value = e instanceof Error ? e.message : 'Something went wrong.';
    if (e instanceof ApiError && e.status === 401) {
      locked.value = true;
      setToken('');
    }
  }
  async function initialize() {
    try {
      config.value = await api.config();
      const hash = new URLSearchParams(location.hash.slice(1));
      const supplied = hash.get('session');
      if (supplied) {
        history.replaceState(null, '', location.pathname);
        await api.unlock(supplied);
      }
      connections.value = await api.list();
      locked.value = false;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) report(e);
    } finally {
      ready.value = true;
    }
  }
  async function unlock(token: string) {
    error.value = '';
    try {
      await api.unlock(token);
      connections.value = await api.list();
      locked.value = false;
    } catch (e) {
      report(e);
    }
  }
  async function reloadConnections() {
    connections.value = await api.list();
  }
  async function connect(id: string) {
    const request = ++connectionRequest;
    ++rowRequest;
    ++diagramRequest;
    diagram.value = null;
    diagramBusy.value = false;
    diagramError.value = '';
    activeId.value = id;
    selected.value = null;
    tables.value = [];
    tabs.value = [];
    result.value = null;
    busy.value = false;
    connecting.value = true;
    error.value = '';
    search.value = '';
    sort.value = '';
    try {
      const items = await api.tables(id);
      if (request === connectionRequest) tables.value = items;
    } catch (e) {
      if (request === connectionRequest) report(e);
    } finally {
      if (request === connectionRequest) connecting.value = false;
    }
  }
  function disconnect() {
    ++connectionRequest;
    ++rowRequest;
    ++diagramRequest;
    diagram.value = null;
    diagramBusy.value = false;
    diagramError.value = '';
    activeId.value = '';
    tables.value = [];
    tabs.value = [];
    selected.value = null;
    result.value = null;
    busy.value = false;
    connecting.value = false;
    error.value = '';
  }
  async function load() {
    if (!selected.value || !activeId.value) return;
    const request = ++rowRequest;
    busy.value = true;
    error.value = '';
    try {
      const value = await api.rows(activeId.value, {
        schema: selected.value.schema,
        table: selected.value.name,
        page: page.value,
        limit: limit.value,
        search: search.value,
        searchColumn: searchColumn.value || undefined,
        sort: sort.value || undefined,
        direction: direction.value,
      });
      if (request === rowRequest) result.value = value;
    } catch (e) {
      if (request === rowRequest) {
        result.value = null;
        report(e);
      }
    } finally {
      if (request === rowRequest) busy.value = false;
    }
  }
  async function loadDiagram(id: string, schema: string) {
    const request = ++diagramRequest;
    diagramBusy.value = true;
    diagramError.value = '';
    diagram.value = null;
    try {
      const value = await api.diagram(id, schema);
      if (request === diagramRequest) diagram.value = value;
    } catch (e) {
      if (request === diagramRequest) {
        diagramError.value =
          e instanceof Error ? e.message : 'Could not read the database structure.';
        if (e instanceof ApiError && e.status === 401) report(e);
      }
    } finally {
      if (request === diagramRequest) diagramBusy.value = false;
    }
  }
  async function open(table: TableInfo) {
    if (!tabs.value.some((t) => t.schema === table.schema && t.name === table.name))
      tabs.value.push(table);
    selected.value = table;
    page.value = 1;
    search.value = '';
    searchColumn.value = '';
    sort.value = '';
    result.value = null;
    await load();
  }
  async function closeTab(table: TableInfo) {
    const i = tabs.value.findIndex((t) => t.schema === table.schema && t.name === table.name);
    tabs.value.splice(i, 1);
    if (selected.value?.name === table.name && selected.value?.schema === table.schema) {
      if (tabs.value.length) await open(tabs.value[Math.min(i, tabs.value.length - 1)]!);
      else {
        ++rowRequest;
        selected.value = null;
        result.value = null;
        busy.value = false;
      }
    }
  }
  async function remove(id: string) {
    await api.remove(id);
    if (activeId.value === id) disconnect();
    await reloadConnections();
  }
  function lock() {
    disconnect();
    setToken('');
    locked.value = true;
  }
  return {
    connections,
    activeId,
    active,
    tables,
    selected,
    result,
    tabs,
    busy,
    connecting,
    error,
    notice,
    locked,
    ready,
    page,
    limit,
    search,
    searchColumn,
    sort,
    direction,
    config,
    diagram,
    diagramBusy,
    diagramError,
    loadDiagram,
    initialize,
    unlock,
    reloadConnections,
    connect,
    disconnect,
    load,
    open,
    closeTab,
    remove,
    report,
    lock,
  };
});
