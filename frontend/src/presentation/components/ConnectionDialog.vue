<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useForm, type InvalidSubmissionContext } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import {
  connectionSchema,
  sshSchema,
  type ConnectionInput,
  type ConnectionSummary,
} from '@db-explorer/shared';
import {
  Database,
  X,
  ShieldCheck,
  Server,
  KeyRound,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  Upload,
} from 'lucide-vue-next';
import {
  connectionCommands,
  ConnectionCommandError,
} from '../../application/use-cases/connection.commands';
const props = defineProps<{ connection?: ConnectionSummary }>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();
const tab = ref<'general' | 'ssh' | 'tls'>('general'),
  testing = ref(false),
  saving = ref(false),
  message = ref(''),
  success = ref(false),
  sshEnabled = ref(!!props.connection?.ssh);
const ssh = reactive({
  host: props.connection?.ssh?.host ?? '',
  port: props.connection?.ssh?.port ?? 22,
  username: props.connection?.ssh?.username ?? '',
  auth: props.connection?.ssh?.auth ?? ('agent' as 'password' | 'key' | 'agent'),
  password: '',
  privateKey: '',
  passphrase: '',
  fingerprint: props.connection?.ssh?.fingerprint ?? '',
});
const { defineField, errors, handleSubmit, setFieldValue, setFieldError } =
  useForm<ConnectionInput>({
    validationSchema: toTypedSchema(connectionSchema),
    initialValues: {
      name: props.connection?.name ?? '',
      engine: props.connection?.engine ?? 'postgresql',
      host: props.connection?.host ?? '127.0.0.1',
      port: props.connection?.port ?? 5432,
      database: props.connection?.database ?? '',
      username: props.connection?.username ?? '',
      password: '',
      color: props.connection?.color ?? 'teal',
      environment: props.connection?.environment ?? 'local',
      tls: props.connection?.tls ?? { enabled: false },
    },
  });
const [name] = defineField('name'),
  [engine] = defineField('engine'),
  [host] = defineField('host'),
  [port] = defineField('port'),
  [database] = defineField('database'),
  [username] = defineField('username'),
  [password] = defineField('password'),
  [color] = defineField('color'),
  [environment] = defineField('environment'),
  [tlsEnabled] = defineField('tls.enabled'),
  [tlsCa] = defineField('tls.ca'),
  [serverName] = defineField('tls.serverName');
function engineChanged() {
  port.value = engine.value === 'postgresql' ? 5432 : 3306;
}
function sync() {
  message.value = '';
  setFieldValue('ssh', sshEnabled.value ? { ...ssh } : undefined);
}
function fail(e: unknown) {
  success.value = false;
  message.value = e instanceof Error ? e.message : 'Could not save this connection.';
  if (e instanceof ConnectionCommandError)
    for (const [field, error] of Object.entries(e.fields)) setFieldError(field as 'name', error);
}
const fieldLabels: Record<string, string> = {
  name: 'Connection name',
  engine: 'Database engine',
  host: 'Database host',
  port: 'Database port',
  database: 'Database name',
  username: 'Database username',
  password: 'Database password',
  'ssh.host': 'SSH host',
  'ssh.port': 'SSH port',
  'ssh.username': 'SSH username',
  'ssh.password': 'SSH password',
  'ssh.privateKey': 'SSH private key',
  'ssh.passphrase': 'Key passphrase',
  'ssh.fingerprint': 'SSH host fingerprint',
  'tls.ca': 'TLS CA certificate',
  'tls.serverName': 'TLS server name',
};
const invalid = ({ errors: invalidFields }: InvalidSubmissionContext<ConnectionInput>) => {
  const entries = Object.entries(invalidFields).filter(([, error]) => !!error);
  message.value =
    'Please check: ' +
    entries.map(([field, error]) => `${fieldLabels[field] ?? field}: ${error}`).join('; ');
  const first = entries[0]?.[0] ?? '';
  tab.value = first.startsWith('ssh') ? 'ssh' : first.startsWith('tls') ? 'tls' : 'general';
  success.value = false;
};
const save = handleSubmit(async (value) => {
  saving.value = true;
  try {
    const c = props.connection
      ? await connectionCommands.update(props.connection.id, {
          ...value,
          password: value.password || undefined,
        })
      : await connectionCommands.create(value);
    emit('saved', c.id);
  } catch (e) {
    fail(e);
  } finally {
    saving.value = false;
  }
}, invalid);
const test = handleSubmit(async (value) => {
  testing.value = true;
  try {
    const result = props.connection
      ? await connectionCommands.testSaved(props.connection.id, {
          ...value,
          password: value.password || undefined,
        })
      : await connectionCommands.test(value);
    message.value = 'Connected successfully · ' + result.version;
    success.value = true;
  } catch (e) {
    fail(e);
  } finally {
    testing.value = false;
  }
}, invalid);
function submit() {
  sync();
  void save();
}
function testConnection() {
  sync();
  void test();
}
async function testSshOnly() {
  message.value = '';
  success.value = false;
  const result = sshSchema.safeParse({ ...ssh });
  if (!result.success) {
    message.value = result.error.issues.map((issue) => issue.message).join(' ');
    return;
  }
  testing.value = true;
  try {
    await connectionCommands.testSsh(result.data);
    success.value = true;
    message.value =
      'SSH sign-in succeeded. Next, enter the database host, port and database credentials under General, then use Test connection.';
  } catch (error) {
    fail(error);
  } finally {
    testing.value = false;
  }
}
async function inspectFingerprint() {
  testing.value = true;
  try {
    ssh.fingerprint = (await connectionCommands.fingerprint(ssh.host, ssh.port)).fingerprint;
    success.value = true;
    message.value =
      'Fingerprint fetched. Compare it with your administrator’s trusted fingerprint before connecting.';
  } catch (e) {
    fail(e);
  } finally {
    testing.value = false;
  }
}
async function uploadKey(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    if (file.size > 65536) {
      message.value = 'Private key must be smaller than 64 KB.';
      return;
    }
    ssh.privateKey = await file.text();
  }
}
</script>
<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <section
      class="dialog connection-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connection-title"
      @keydown.esc="emit('close')"
    >
      <header class="dialog-header">
        <div class="dialog-symbol"><Database :size="23" /></div>
        <div>
          <h2 id="connection-title">{{ connection ? 'Edit connection' : 'New connection' }}</h2>
          <p>A clear connection to your data.</p>
        </div>
        <button
          class="icon-button close-dialog"
          aria-label="Close connection dialog"
          @click="emit('close')"
        >
          <X :size="19" />
        </button>
      </header>
      <nav class="dialog-tabs" aria-label="Connection settings">
        <button :class="{ active: tab === 'general' }" @click="tab = 'general'">
          <Database :size="15" />General</button
        ><button :class="{ active: tab === 'ssh' }" @click="tab = 'ssh'">
          <Server :size="15" />SSH tunnel <span v-if="sshEnabled" class="dot" /></button
        ><button :class="{ active: tab === 'tls' }" @click="tab = 'tls'">
          <ShieldCheck :size="15" />TLS / SSL <span v-if="tlsEnabled" class="dot" />
        </button>
      </nav>
      <form @submit.prevent="submit">
        <div class="dialog-body" v-show="tab === 'general'">
          <p v-if="sshEnabled" class="form-hint">
            SSH tunnel is enabled. Database Host and Port below must be reachable from the SSH
            server, not from your computer. Use its database credentials below.
          </p>
          <label
            >Connection name<input
              v-model="name"
              aria-label="Connection name"
              :aria-invalid="!!errors.name"
              placeholder="e.g. Production analytics"
              autofocus
              autocomplete="off"
            /><small class="field-error">{{ errors.name }}</small></label
          >
          <div class="engine-picker">
            <button
              type="button"
              :class="{ selected: engine === 'postgresql' }"
              @click="
                engine = 'postgresql';
                engineChanged();
              "
            >
              <span class="engine-icon pg">P</span
              ><span>PostgreSQL<small>Reliable. Powerful. Open.</small></span
              ><span class="radio-dot" /></button
            ><button
              type="button"
              :class="{ selected: engine === 'mysql' }"
              @click="
                engine = 'mysql';
                engineChanged();
              "
            >
              <span class="engine-icon mysql">M</span
              ><span>MySQL<small>Familiar. Fast. Flexible.</small></span
              ><span class="radio-dot" />
            </button>
          </div>
          <div class="form-row host-row">
            <label
              >Host<input
                v-model="host"
                aria-label="Host"
                :aria-invalid="!!errors.host"
                placeholder="127.0.0.1"
                autocomplete="off"
              /><small class="field-error">{{ errors.host }}</small></label
            ><label
              >Port<input
                v-model="port"
                aria-label="Port"
                :aria-invalid="!!errors.port"
                type="number"
                min="1"
                max="65535"
              /><small class="field-error">{{ errors.port }}</small></label
            >
          </div>
          <label
            >Database<input
              v-model="database"
              aria-label="Database"
              :aria-invalid="!!errors.database"
              placeholder="Database name"
              autocomplete="off"
            /><small class="field-error">{{ errors.database }}</small></label
          >
          <div class="form-row">
            <label
              >Username<input
                v-model="username"
                aria-label="Username"
                :aria-invalid="!!errors.username"
                placeholder="read_only_user"
                autocomplete="off"
              /><small class="field-error">{{ errors.username }}</small></label
            ><label
              >Password<input
                v-model="password"
                aria-label="Password"
                :aria-invalid="!!errors.password"
                type="password"
                :placeholder="
                  connection ? 'Leave empty to keep saved password' : 'Database password'
                "
                autocomplete="new-password"
              /><small class="field-error">{{ errors.password }}</small></label
            >
          </div>
          <div class="form-row">
            <label
              >Environment<select v-model="environment">
                <option value="local">Local</option>
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select></label
            >
            <div class="color-field">
              <span>Connection color</span>
              <div class="color-picker">
                <button
                  v-for="c in ['teal', 'blue', 'orange', 'purple'] as const"
                  :key="c"
                  type="button"
                  :class="['color-swatch', c, { selected: color === c }]"
                  :aria-label="c"
                  :aria-pressed="color === c"
                  @click="color = c"
                />
              </div>
            </div>
          </div>
          <p class="form-hint">
            <ShieldCheck :size="15" />Use a read-only database account. Passwords stay in your
            encrypted workspace.
          </p>
        </div>
        <div class="dialog-body" v-show="tab === 'ssh'">
          <label class="toggle-label"
            ><input type="checkbox" v-model="sshEnabled" />Connect through an SSH tunnel</label
          >
          <p class="muted">
            SSH signs in to your server; the database username and password are separate and belong
            under General.
          </p>
          <template v-if="sshEnabled"
            ><div class="form-row host-row">
              <label>SSH host<input v-model="ssh.host" placeholder="bastion.example.com" /></label
              ><label>SSH port<input v-model.number="ssh.port" type="number" /></label>
            </div>
            <label>SSH username<input v-model="ssh.username" autocomplete="off" /></label
            ><label
              >Authentication<select v-model="ssh.auth" aria-label="Authentication">
                <option value="agent">Use SSH agent (no password / key file)</option>
                <option value="password">Password</option>
                <option value="key">Private key</option>
              </select></label
            >
            <p v-if="ssh.auth === 'agent'" class="form-hint">
              Uses keys already unlocked in the SSH agent on the computer running DB Explorer. No
              password or private key file is copied into this connection.
            </p>
            <label v-if="ssh.auth === 'password'"
              >SSH password<input
                v-model="ssh.password"
                type="password"
                autocomplete="new-password" /></label
            ><template v-else-if="ssh.auth === 'key'"
              ><label
                >Private key<textarea
                  v-model="ssh.privateKey"
                  rows="3"
                  placeholder="Paste your private key"
                  spellcheck="false"
                /></label
              ><label class="file-button"
                ><Upload :size="14" />Choose key file<input
                  type="file"
                  @change="uploadKey" /></label
              ><label
                >Key passphrase<input
                  v-model="ssh.passphrase"
                  type="password"
                  autocomplete="new-password" /></label></template
            ><label
              >Verified host-key fingerprint<input
                v-model="ssh.fingerprint"
                placeholder="SHA256:…"
                class="mono" /></label
            ><button
              class="button secondary compact"
              type="button"
              :disabled="testing || !ssh.host"
              @click="inspectFingerprint"
            >
              Get server fingerprint
            </button>
            <button
              class="button secondary compact"
              type="button"
              :disabled="testing"
              @click="testSshOnly"
            >
              Test SSH sign-in
            </button>
            <p class="form-hint">
              Get the SHA256 fingerprint from your server administrator through a trusted channel. A
              changed key blocks the connection.
            </p>
            <p class="form-hint" v-if="connection?.ssh">
              Re-enter SSH secrets when editing a password or private-key connection.
            </p>
            <small class="field-error" v-for="(error, key) in errors" :key="key">{{
              String(key).startsWith('ssh') ? error : ''
            }}</small></template
          >
        </div>
        <div class="dialog-body" v-show="tab === 'tls'">
          <label class="toggle-label"
            ><input type="checkbox" v-model="tlsEnabled" />Use a verified TLS connection</label
          >
          <p class="muted">
            Optional: encrypt the database connection. Enable this only when required by your
            database server or organization. SSH tunneling does not require this switch.
          </p>
          <template v-if="tlsEnabled"
            ><label
              >Server name<input
                v-model="serverName"
                placeholder="Optional certificate hostname" /></label
            ><label
              >CA certificate<textarea
                v-model="tlsCa"
                rows="7"
                placeholder="Optional PEM certificate. Uses trusted system certificates when empty."
                spellcheck="false"
              />
            </label>
            <p class="form-hint">
              <ShieldCheck :size="15" />Certificate verification is always enabled.
            </p></template
          >
        </div>
        <div v-if="message" :class="['form-message', { success }]" role="status">
          <CheckCircle2 v-if="success" :size="16" /><AlertCircle v-else :size="16" /><span>{{
            message
          }}</span>
        </div>
        <footer class="dialog-footer">
          <button
            type="button"
            class="button secondary"
            :disabled="testing || saving"
            @click="testConnection"
          >
            <LoaderCircle v-if="testing" class="spin" :size="15" /><span
              v-else
              class="status-dot"
            />{{ testing ? 'Testing…' : 'Test connection' }}
          </button>
          <div>
            <button type="button" class="button ghost" @click="emit('close')">Cancel</button
            ><button class="button primary" type="submit" :disabled="saving || testing">
              <LoaderCircle v-if="saving" class="spin" :size="15" />{{
                saving ? 'Saving…' : connection ? 'Save changes' : 'Save & connect'
              }}
            </button>
          </div>
        </footer>
      </form>
    </section>
  </div>
</template>
