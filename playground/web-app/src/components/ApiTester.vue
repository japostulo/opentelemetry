<script setup lang="ts">
import { ref } from 'vue';

interface ApiResponse {
  service?: string;
  traceId?: string;
  message?: string;
  downstream?: ApiResponse;
  received?: Record<string, unknown>;
  user?: Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}

const props = defineProps<{
  label: string;
  url: string;
  method?: string;
  body?: string;
  color?: string;
}>();

const result = ref<{ status?: number; data: ApiResponse | string } | null>(null);
const loading = ref(false);

async function execute() {
  loading.value = true;
  result.value = null;
  try {
    const options: RequestInit = { method: props.method || 'GET' };
    if (props.body) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = props.body;
    }
    const res = await fetch(props.url, options);
    let data: ApiResponse | string;
    try { data = await res.json(); } catch { data = await res.text(); }
    result.value = { status: res.status, data };
  } catch (err) {
    result.value = { status: 0, data: err instanceof Error ? err.message : 'Request failed' };
  } finally {
    loading.value = false;
  }
}

function statusColor(status?: number): string {
  if (!status) return 'error';
  if (status < 300) return 'success';
  if (status < 500) return 'warning';
  return 'error';
}
</script>

<template>
  <v-card variant="outlined" class="mb-3">
    <v-card-text class="pa-3">
      <div class="d-flex align-center">
        <v-btn size="small" variant="flat" :color="color || 'primary'" :loading="loading" @click="execute">
          <v-icon start size="small">mdi-play</v-icon>
          {{ label }}
        </v-btn>
        <v-chip v-if="method" size="x-small" variant="outlined" class="ml-2">{{ method || 'GET' }}</v-chip>
        <code class="text-caption ml-2 text-grey">{{ url }}</code>
        <v-spacer />
        <v-chip v-if="result?.status" :color="statusColor(result.status)" size="small" variant="flat">
          {{ result.status }}
        </v-chip>
      </div>
      <v-expand-transition>
        <div v-if="result">
          <v-divider class="my-2" />
          <pre class="text-caption pa-2 bg-grey-lighten-4 rounded" style="overflow-x: auto; max-height: 200px; white-space: pre-wrap;">{{ typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2) }}</pre>
        </div>
      </v-expand-transition>
    </v-card-text>
  </v-card>
</template>
