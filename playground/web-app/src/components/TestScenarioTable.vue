<script setup lang="ts">
import { ref, computed } from 'vue';

export interface TestScenario {
  id: string;
  app: string;
  profile: string;
  envOverride?: string;
  endpoint: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  expected: string;
  signozValidation: string;
  curlCommand?: string;
}

const props = defineProps<{
  scenarios: TestScenario[];
  title: string;
}>();

const emit = defineEmits<{
  execute: [scenario: TestScenario];
}>();

const results = ref<Record<string, { status?: number; data?: unknown; error?: string }>>({});
const loading = ref<Record<string, boolean>>({});
const validated = ref<Record<string, boolean>>({});

const completedCount = computed(() =>
  Object.values(validated.value).filter(Boolean).length
);

async function executeTest(scenario: TestScenario) {
  loading.value[scenario.id] = true;
  results.value[scenario.id] = {};
  try {
    const options: RequestInit = { method: scenario.method || 'GET' };
    const extraHeaders: Record<string, string> = scenario.headers ? { ...scenario.headers } : {};
    if (scenario.body) {
      options.headers = { 'Content-Type': 'application/json', ...extraHeaders };
      options.body = scenario.body;
    } else if (Object.keys(extraHeaders).length > 0) {
      options.headers = extraHeaders;
    }
    const res = await fetch(scenario.endpoint, options);
    let data: unknown;
    try { data = await res.json(); } catch { data = await res.text(); }
    results.value[scenario.id] = { status: res.status, data };
  } catch (err) {
    results.value[scenario.id] = { error: err instanceof Error ? err.message : 'Failed' };
  } finally {
    loading.value[scenario.id] = false;
    emit('execute', scenario);
  }
}

function toggleValidated(id: string) {
  validated.value[id] = !validated.value[id];
}

function statusColor(status?: number): string {
  if (!status) return 'error';
  if (status < 300) return 'success';
  if (status < 500) return 'warning';
  return 'error';
}
</script>

<template>
  <v-card variant="outlined" class="mb-6">
    <v-card-title class="d-flex align-center py-3">
      <v-icon class="mr-2">mdi-test-tube</v-icon>
      {{ title }}
      <v-spacer />
      <v-chip :color="completedCount === scenarios.length ? 'success' : 'grey'" variant="flat" size="small">
        {{ completedCount }} / {{ scenarios.length }} validados
      </v-chip>
    </v-card-title>

    <v-table density="comfortable" hover>
      <thead>
        <tr>
          <th style="width: 40px" class="text-center">#</th>
          <th>App</th>
          <th>Profile</th>
          <th>Override</th>
          <th>Endpoint</th>
          <th>Esperado</th>
          <th style="width: 120px" class="text-center">Ações</th>
          <th style="width: 50px" class="text-center">
            <v-icon size="small">mdi-check-circle-outline</v-icon>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(s, idx) in scenarios" :key="s.id">
          <tr>
            <td class="text-center text-grey">{{ idx + 1 }}</td>
            <td>
              <v-chip size="x-small" :color="s.app === 'NestJS' ? 'red' : s.app === 'Express' ? 'green' : s.app === 'Laravel' ? 'orange' : 'blue'" variant="flat">
                {{ s.app }}
              </v-chip>
            </td>
            <td><code>{{ s.profile }}</code></td>
            <td>
              <code v-if="s.envOverride" class="text-caption">{{ s.envOverride }}</code>
              <span v-else class="text-grey">—</span>
            </td>
            <td><code class="text-caption">{{ s.method || 'GET' }} {{ s.endpoint.replace(/http:\/\/localhost:\d+/, '') }}</code></td>
            <td class="text-body-2" style="max-width: 300px">{{ s.expected }}</td>
            <td class="text-center">
              <v-btn size="x-small" variant="flat" color="primary"
                :loading="loading[s.id]" @click="executeTest(s)">
                <v-icon size="small" start>mdi-play</v-icon>
                Run
              </v-btn>
            </td>
            <td class="text-center">
              <v-checkbox-btn v-model="validated[s.id]" color="success"
                @click.stop="toggleValidated(s.id)" density="compact" />
            </td>
          </tr>
          <!-- Result row -->
          <tr v-if="results[s.id]?.status || results[s.id]?.error">
            <td></td>
            <td colspan="7" class="py-2">
              <v-alert :type="results[s.id]?.error ? 'error' : 'info'" density="compact" variant="tonal" class="mb-1">
                <div class="d-flex align-center mb-1">
                  <v-chip v-if="results[s.id]?.status" :color="statusColor(results[s.id]?.status)" size="x-small" variant="flat" class="mr-2">
                    {{ results[s.id]?.status }}
                  </v-chip>
                  <span class="text-caption font-weight-bold">Resultado da Execução</span>
                </div>
                <pre class="text-caption" style="white-space: pre-wrap; max-height: 150px; overflow-y: auto;">{{ JSON.stringify(results[s.id]?.data || results[s.id]?.error, null, 2) }}</pre>
              </v-alert>
              <v-alert type="info" density="compact" variant="outlined" class="mt-1">
                <div class="text-caption font-weight-bold mb-1">
                  <v-icon size="small" class="mr-1">mdi-chart-timeline-variant</v-icon>
                  Validação no SigNoz
                </div>
                <div class="text-caption">{{ s.signozValidation }}</div>
              </v-alert>
            </td>
          </tr>
        </template>
      </tbody>
    </v-table>
  </v-card>
</template>
