<script setup lang="ts">
import { ref } from 'vue';

interface ApiResponse {
  service: string;
  traceId?: string;
  message?: string;
  downstream?: ApiResponse;
  received?: Record<string, unknown>;
  user?: Record<string, unknown>;
  error?: string;
}

const results = ref<{ label: string; data: ApiResponse | string }[]>([]);
const loading = ref(false);

async function callApi(label: string, url: string, options?: RequestInit) {
  loading.value = true;
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    results.value.unshift({ label, data });
  } catch (err) {
    results.value.unshift({
      label,
      data: err instanceof Error ? err.message : 'Request failed',
    });
  } finally {
    loading.value = false;
  }
}

function callNestHello() {
  callApi('NestJS /hello', 'http://localhost:3010/hello');
}

function callExpressHello() {
  callApi('Express /hello', 'http://localhost:3020/hello');
}

function callLaravelHello() {
  callApi('Laravel /api/hello', 'http://localhost:8085/api/hello');
}

function callFullChain() {
  callApi('Full Chain (NestJS → Express → Laravel)', 'http://localhost:3010/chain');
}

function callEcho() {
  callApi('POST /echo (with sensitive fields)', 'http://localhost:3010/echo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test User',
      password: 'secret123',
      cpf: '12345678900',
      message: 'Hello from web!',
    }),
  });
}

function callIdentity() {
  callApi('Identity', 'http://localhost:3010/identity');
}

function triggerError() {
  throw new Error('Playground test error — this should appear as a span in SigNoz');
}
</script>

<template>
  <div style="font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem;">
    <h1 style="color: #1a56db;">HAOC OpenTelemetry Playground</h1>
    <p style="color: #666;">
      Clique nos botões para testar as libs. Verifique os traces no
      <a href="http://localhost:3301" target="_blank">SigNoz</a>.
    </p>

    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1.5rem 0;">
      <button @click="callNestHello" :disabled="loading"
        style="padding: 0.6rem 1.2rem; background: #1a56db; color: white; border: none; border-radius: 6px; cursor: pointer;">
        NestJS /hello
      </button>
      <button @click="callExpressHello" :disabled="loading"
        style="padding: 0.6rem 1.2rem; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer;">
        Express /hello
      </button>
      <button @click="callLaravelHello" :disabled="loading"
        style="padding: 0.6rem 1.2rem; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer;">
        Laravel /api/hello
      </button>
      <button @click="callFullChain" :disabled="loading"
        style="padding: 0.6rem 1.2rem; background: #7c3aed; color: white; border: none; border-radius: 6px; cursor: pointer;">
        Full Chain
      </button>
      <button @click="callEcho" :disabled="loading"
        style="padding: 0.6rem 1.2rem; background: #d97706; color: white; border: none; border-radius: 6px; cursor: pointer;">
        POST /echo (sensitive)
      </button>
      <button @click="callIdentity" :disabled="loading"
        style="padding: 0.6rem 1.2rem; background: #0891b2; color: white; border: none; border-radius: 6px; cursor: pointer;">
        Identity
      </button>
      <button @click="triggerError"
        style="padding: 0.6rem 1.2rem; background: #be123c; color: white; border: none; border-radius: 6px; cursor: pointer;">
        Trigger Error
      </button>
    </div>

    <div v-if="results.length" style="margin-top: 1rem;">
      <h2>Resultados</h2>
      <div v-for="(r, i) in results" :key="i"
        style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;">
        <strong style="color: #334155;">{{ r.label }}</strong>
        <pre style="margin: 0.5rem 0 0; font-size: 0.85rem; overflow-x: auto; white-space: pre-wrap;">{{ typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>
