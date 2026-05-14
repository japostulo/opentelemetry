<script setup lang="ts">
import { ref, computed } from 'vue';

interface Scenario {
  id: string;
  category: string;
  profile: string;
  service: string;
  endpoint: string;
  method: 'GET' | 'POST';
  body?: string;
  description: string;
  expected: string;
  signozSteps: string[];
}

const scenarios: Scenario[] = [
  // ── A: Body Capture ──────────────────────────────────────────────────────
  {
    id: 'A1', category: 'Body Capture', profile: 'minimal', service: 'NestJS', method: 'POST',
    endpoint: 'http://localhost:3010/echo',
    body: JSON.stringify({ name: 'Test', password: 'secret', cpf: '123' }),
    description: 'POST /echo no minimal — SEM body.* no span',
    expected: 'Span NÃO tem atributos body.*. Log Pino tem body (logRequestBody=true por default).',
    signozSteps: [
      'Traces → filtrar: serviceName = playground-nestjs',
      'Abrir o span "POST /echo"',
      'Aba "Tags": NÃO deve existir body.name, body.password',
      'Logs: deve ter req.body.name="Test", req.body.password="[REDACTED]"',
    ],
  },
  {
    id: 'A2', category: 'Body Capture', profile: 'standard', service: 'NestJS', method: 'POST',
    endpoint: 'http://localhost:3010/echo',
    body: JSON.stringify({ name: 'Test', password: 'secret', cpf: '123' }),
    description: 'POST /echo no standard — body.* no span com redação',
    expected: 'body.name="Test", body.password="[REDACTED]", body.cpf="[REDACTED]" nos atributos do span.',
    signozSteps: [
      'Traces → filtrar: serviceName = playground-nestjs',
      'Abrir o span "POST /echo"',
      'Tags: body.name = "Test", body.password = "[REDACTED]", body.cpf = "[REDACTED]"',
      'Tags: response.received.name = "Test"',
    ],
  },
  {
    id: 'A3', category: 'Body Capture', profile: 'minimal', service: 'Express', method: 'POST',
    endpoint: 'http://localhost:3020/echo',
    body: JSON.stringify({ name: 'Test', password: 'secret' }),
    description: 'POST /echo Express no minimal — SEM body no span',
    expected: 'Span Express NÃO tem body.*. Apenas http.method, http.route, http.status_code.',
    signozSteps: [
      'Traces → filtrar: serviceName = playground-express',
      'Abrir span POST /echo',
      'Verificar ausência de body.*',
    ],
  },
  {
    id: 'A4', category: 'Body Capture', profile: 'minimal', service: 'Laravel', method: 'POST',
    endpoint: 'http://localhost:8085/api/echo',
    body: JSON.stringify({ name: 'Test', password: 'secret', cpf: '123' }),
    description: 'POST /api/echo Laravel minimal — SEM body no span',
    expected: 'TraceRequest span NÃO tem body.*.',
    signozSteps: [
      'Traces → filtrar: serviceName = playground-laravel',
      'Abrir span POST /api/echo',
      'Tags: NÃO deve ter body.*',
    ],
  },
  {
    id: 'A5', category: 'Body Capture', profile: 'standard', service: 'Laravel', method: 'POST',
    endpoint: 'http://localhost:8085/api/echo',
    body: JSON.stringify({ name: 'Test', password: 'secret', cpf: '123' }),
    description: 'POST /api/echo Laravel standard — body com redação',
    expected: 'body.name="Test", body.password="[REDACTED]", body.cpf="[REDACTED]".',
    signozSteps: [
      'Traces → filtrar: serviceName = playground-laravel',
      'Abrir span POST /api/echo',
      'Tags: body.name="Test", body.password="[REDACTED]"',
    ],
  },

  // ── B: Distributed Tracing ───────────────────────────────────────────────
  {
    id: 'B1', category: 'Distributed Tracing', profile: 'minimal', service: 'NestJS', method: 'GET',
    endpoint: 'http://localhost:3010/chain',
    description: 'Full chain NestJS → Express → Laravel',
    expected: '1 trace com 3 spans (um por serviço). TraceId propagado via W3C Trace Context.',
    signozSteps: [
      'Traces → buscar pelo traceId retornado na resposta',
      'Visualização de trace: deve mostrar 3 spans encadeados',
      'playground-nestjs → playground-express → playground-laravel',
      'Todos com o mesmo traceId',
    ],
  },
  {
    id: 'B2', category: 'Distributed Tracing', profile: 'minimal', service: 'NestJS', method: 'GET',
    endpoint: 'http://localhost:3010/chain-laravel',
    description: 'NestJS → Laravel (direto, sem Express)',
    expected: '1 trace com 2 spans: nestjs e laravel com mesmo traceId.',
    signozSteps: [
      'Traces → buscar pelo traceId',
      '2 spans: playground-nestjs e playground-laravel',
    ],
  },

  // ── C: Error Handling ────────────────────────────────────────────────────
  {
    id: 'C1', category: 'Error Handling', profile: 'minimal', service: 'NestJS', method: 'GET',
    endpoint: 'http://localhost:3010/error-4xx',
    description: 'NestJS 400 Bad Request',
    expected: 'Span com status=ERROR, http.status_code=400. Span não marcado como falha de servidor.',
    signozSteps: [
      'Traces → filtrar: serviceName=playground-nestjs, status=ERROR',
      'Span "GET /error-4xx": http.status_code=400',
      'Status: ERROR com mensagem "Bad Request"',
    ],
  },
  {
    id: 'C2', category: 'Error Handling', profile: 'minimal', service: 'NestJS', method: 'GET',
    endpoint: 'http://localhost:3010/error-5xx',
    description: 'NestJS 500 Internal Server Error',
    expected: 'Span com status=ERROR, http.status_code=500.',
    signozSteps: [
      'Traces → filtrar: serviceName=playground-nestjs, status=ERROR',
      'Span "GET /error-5xx": http.status_code=500',
      'Logs: mensagem de erro "Database connection refused"',
    ],
  },
  {
    id: 'C3', category: 'Error Handling', profile: 'minimal', service: 'NestJS', method: 'GET',
    endpoint: 'http://localhost:3010/chain-error',
    description: 'NestJS → Express /error-5xx (propagação de erro)',
    expected: '2 spans: NestJS (502) e Express (500). Ambos com status=ERROR. error.upstream_status=500.',
    signozSteps: [
      'Traces → buscar pelo traceId da resposta',
      '2 spans encadeados, ambos com status=ERROR',
      'NestJS span: error.upstream_status=500, http.status_code=502',
    ],
  },
  {
    id: 'C4', category: 'Error Handling', profile: 'minimal', service: 'Laravel', method: 'GET',
    endpoint: 'http://localhost:8085/api/error-5xx',
    description: 'Laravel 500 (RuntimeException)',
    expected: 'Span com status=ERROR, exception registrada.',
    signozSteps: [
      'Traces → filtrar: serviceName=playground-laravel',
      'Span status=ERROR',
      'Atributo exception.message = "Simulated MongoDB connection refused"',
    ],
  },

  // ── D: Log Destination ───────────────────────────────────────────────────
  {
    id: 'D1', category: 'Log Destination', profile: 'minimal', service: 'NestJS', method: 'GET',
    endpoint: 'http://localhost:3010/hello',
    description: 'LOG_DESTINATION=both — log no console E no SigNoz',
    expected: 'Log visível em "docker compose logs nestjs-app" E em SigNoz → Logs.',
    signozSteps: [
      'docker compose logs playground-nestjs-app-1 | tail -20',
      'Verificar log JSON com level, traceId, msg',
      'SigNoz → Logs: filtrar serviceName=playground-nestjs, ver o mesmo log',
    ],
  },
  {
    id: 'D2', category: 'Log Destination', profile: 'minimal', service: 'NestJS', method: 'GET',
    endpoint: 'http://localhost:3010/hello',
    description: 'LOG_DESTINATION=console — log APENAS no console (não chega ao SigNoz)',
    expected: 'Log visível no console mas NÃO em SigNoz → Logs.',
    signozSteps: [
      'Alterar LOG_DESTINATION para "console" via Profile Builder',
      'Chamar GET /hello',
      'docker logs: deve aparecer',
      'SigNoz → Logs: NÃO deve aparecer',
    ],
  },

  // ── E: Redação de Dados Sensíveis ────────────────────────────────────────
  {
    id: 'E1', category: 'Redação', profile: 'standard', service: 'NestJS', method: 'POST',
    endpoint: 'http://localhost:3010/echo',
    body: JSON.stringify({ name: 'João', password: 'minhaSenha', cpf: '12345678900', token: 'abc', message: 'ok' }),
    description: 'Campos sensíveis são redactados em spans e logs',
    expected: 'password, cpf, token → "[REDACTED]". name e message aparecem normalmente.',
    signozSteps: [
      'Span Tags: body.password = "[REDACTED]", body.cpf = "[REDACTED]", body.token = "[REDACTED]"',
      'body.name = "João", body.message = "ok" (não redactados)',
      'Logs: mesmo comportamento nos campos req.body.*',
    ],
  },

  // ── F: Identity & Baggage ────────────────────────────────────────────────
  {
    id: 'F1', category: 'Identity & Baggage', profile: 'minimal', service: 'NestJS', method: 'GET',
    endpoint: 'http://localhost:3010/secured/profile',
    description: 'identifyUser() via guard — user.id/role/type no span e no log',
    expected: 'user.id="usr_42", user.role="admin", user.type="authenticated" no span e no log de resposta. (Header: x-user-id: usr_42, x-user-role: admin)',
    signozSteps: [
      'Traces → filtrar: serviceName=playground-nestjs',
      'Span "GET /secured/profile"',
      'Tags: user.id = "usr_42", user.role = "admin", user.type = "authenticated"',
      'Logs → mesmos atributos no log de resposta',
    ],
  },
  {
    id: 'F2b', category: 'Identity & Baggage', profile: 'minimal', service: 'Express', method: 'GET',
    endpoint: 'http://localhost:3020/secured/profile',
    description: 'identifyUser() via middleware Express — user.id/role/type no span',
    expected: 'user.id="usr_99", user.role="operator", user.type="authenticated" no span. (Header: x-user-id: usr_99, x-user-role: operator)',
    signozSteps: [
      'Traces → filtrar: serviceName=playground-express',
      'Span "GET /secured/profile"',
      'Tags: user.id = "usr_99", user.role = "operator", user.type = "authenticated"',
    ],
  },

  // ── G: Latência ──────────────────────────────────────────────────────────
  {
    id: 'G1', category: 'Latência', profile: 'minimal', service: 'NestJS', method: 'GET',
    endpoint: 'http://localhost:3010/slow?ms=3000',
    description: 'Endpoint com delay de 3s — duração do span',
    expected: 'Span com duration ≥ 3000ms. test.delay_ms=3000.',
    signozSteps: [
      'Traces → filtrar: serviceName=playground-nestjs',
      'Span "GET /slow": duration ≥ 3s',
      'Tags: test.delay_ms = 3000',
    ],
  },
];

// ── State ───────────────────────────────────────────────────────────────────
const results = ref<Record<string, { status: number; traceId?: string; error?: string; loading: boolean }>>({});
const filterCategory = ref<string>('Todos');
const filterProfile = ref<string>('Todos');
const tab = ref('run');

const categories = computed(() => ['Todos', ...new Set(scenarios.map(s => s.category))]);
const profileNames = computed(() => ['Todos', ...new Set(scenarios.map(s => s.profile))]);

const filtered = computed(() => scenarios.filter(s => {
  const okCat = filterCategory.value === 'Todos' || s.category === filterCategory.value;
  const okProfile = filterProfile.value === 'Todos' || s.profile === filterProfile.value;
  return okCat && okProfile;
}));

async function runScenario(s: Scenario) {
  results.value[s.id] = { status: 0, loading: true };
  try {
    const opts: RequestInit = { method: s.method };
    if (s.body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = s.body;
    }
    const res = await fetch(s.endpoint, opts);
    const data = await res.json().catch(() => ({}));
    const traceId = data?.traceId || data?.downstream?.traceId;
    results.value[s.id] = { status: res.status, traceId, loading: false };
  } catch (e) {
    results.value[s.id] = { status: 0, error: e instanceof Error ? e.message : 'Error', loading: false };
  }
}

async function runAll() {
  for (const s of filtered.value) {
    await runScenario(s);
    await new Promise(r => setTimeout(r, 300));
  }
}

function statusColor(status: number) {
  if (!status) return 'error';
  if (status < 300) return 'success';
  if (status < 500) return 'warning';
  return 'error';
}

function categoryColor(cat: string) {
  const map: Record<string, string> = {
    'Body Capture': 'blue', 'Distributed Tracing': 'purple', 'Error Handling': 'red',
    'Log Destination': 'teal', 'Redação': 'orange', 'Identity & Baggage': 'cyan', 'Latência': 'amber',
  };
  return map[cat] ?? 'grey';
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4 font-weight-bold">Plano de Validação</h1>
    </div>

    <v-alert type="info" variant="tonal" density="compact" class="mb-4">
      Execute os cenários, colete os <strong>traceIds</strong> e valide no SigNoz (<a href="http://localhost:3301" target="_blank">localhost:3301</a>) seguindo os passos descritos.
      Altere o profile via <strong>Profile Builder</strong> antes de rodar cenários que dependem de um profile específico.
    </v-alert>

    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="run">Executar Cenários</v-tab>
      <v-tab value="plan">Plano Estático</v-tab>
    </v-tabs>

    <v-tabs-window v-model="tab">
      <!-- ── RUN ────────────────────────────────────────────────────────── -->
      <v-tabs-window-item value="run">
        <!-- Filtros -->
        <v-row dense class="mb-4">
          <v-col cols="12" md="4">
            <v-select v-model="filterCategory" label="Categoria" :items="categories" density="compact" variant="outlined" />
          </v-col>
          <v-col cols="12" md="4">
            <v-select v-model="filterProfile" label="Profile" :items="profileNames" density="compact" variant="outlined" />
          </v-col>
          <v-col cols="12" md="4" class="d-flex align-center">
            <v-btn color="primary" variant="flat" prepend-icon="mdi-play-circle" @click="runAll" block>
              Rodar todos ({{ filtered.length }})
            </v-btn>
          </v-col>
        </v-row>

        <!-- Tabela de cenários -->
        <v-card v-for="s in filtered" :key="s.id" variant="outlined" class="mb-3">
          <v-card-text class="pa-4">
            <div class="d-flex align-center flex-wrap gap-2 mb-2">
              <v-chip size="small" variant="flat" :color="categoryColor(s.category)">{{ s.id }}</v-chip>
              <v-chip size="small" variant="outlined" :color="categoryColor(s.category)">{{ s.category }}</v-chip>
              <v-chip size="small" variant="outlined" color="grey">{{ s.service }}</v-chip>
              <v-chip size="x-small" variant="outlined">{{ s.method }}</v-chip>
              <v-chip size="x-small" variant="tonal" :color="s.profile === 'minimal' ? 'green' : s.profile === 'standard' ? 'blue' : 'purple'">
                {{ s.profile }}
              </v-chip>
              <v-spacer />
              <v-btn
                size="small"
                variant="flat"
                color="primary"
                :loading="results[s.id]?.loading"
                prepend-icon="mdi-play"
                @click="runScenario(s)"
              >
                Executar
              </v-btn>
              <v-chip v-if="results[s.id] && !results[s.id].loading"
                :color="statusColor(results[s.id].status)"
                size="small"
                variant="flat"
              >
                {{ results[s.id].status || 'ERR' }}
              </v-chip>
            </div>

            <p class="text-body-2 font-weight-medium mb-1">{{ s.description }}</p>
            <code class="text-caption text-grey">{{ s.endpoint }}</code>

            <!-- TraceId resultado -->
            <v-alert v-if="results[s.id]?.traceId" type="success" variant="tonal" density="compact" class="mt-2">
              <strong>traceId:</strong>
              <code class="ml-1" style="user-select: all;">{{ results[s.id].traceId }}</code>
              <v-btn
                size="x-small"
                variant="text"
                :href="`http://localhost:3301/trace/${results[s.id].traceId}`"
                target="_blank"
                append-icon="mdi-open-in-new"
                class="ml-2"
              >
                Abrir no SigNoz
              </v-btn>
            </v-alert>

            <!-- Validação -->
            <v-expand-transition>
              <div v-if="results[s.id] && !results[s.id].loading">
                <v-divider class="my-2" />
                <p class="text-caption text-grey-darken-1 mb-1"><strong>Esperado:</strong> {{ s.expected }}</p>
                <p class="text-caption font-weight-medium mb-1">Passos de validação no SigNoz:</p>
                <ol class="text-caption pl-4">
                  <li v-for="(step, i) in s.signozSteps" :key="i">{{ step }}</li>
                </ol>
              </div>
            </v-expand-transition>

            <!-- Error -->
            <v-alert v-if="results[s.id]?.error" type="error" variant="tonal" density="compact" class="mt-2">
              {{ results[s.id].error }}
            </v-alert>
          </v-card-text>
        </v-card>
      </v-tabs-window-item>

      <!-- ── PLAN ──────────────────────────────────────────────────────── -->
      <v-tabs-window-item value="plan">
        <v-card variant="outlined">
          <v-card-title class="pa-4">Plano de Validação Completo</v-card-title>
          <v-divider />
          <v-card-text class="pa-4">
            <v-table density="compact">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Categoria</th>
                  <th>Profile</th>
                  <th>Serviço</th>
                  <th>Endpoint</th>
                  <th>Esperado</th>
                  <th>traceId coletado</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in scenarios" :key="s.id">
                  <td>
                    <v-chip size="x-small" :color="categoryColor(s.category)" variant="flat">{{ s.id }}</v-chip>
                  </td>
                  <td class="text-caption">{{ s.category }}</td>
                  <td>
                    <v-chip size="x-small" :color="s.profile === 'minimal' ? 'green' : s.profile === 'standard' ? 'blue' : 'purple'" variant="outlined">{{ s.profile }}</v-chip>
                  </td>
                  <td class="text-caption">{{ s.service }}</td>
                  <td><code class="text-caption">{{ s.endpoint.replace('http://localhost:', ':') }}</code></td>
                  <td class="text-caption" style="max-width: 300px; white-space: normal;">{{ s.expected }}</td>
                  <td>
                    <code v-if="results[s.id]?.traceId" class="text-caption text-success" style="font-size: 10px;">
                      {{ results[s.id].traceId }}
                    </code>
                    <span v-else class="text-caption text-grey">—</span>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-card-text>
        </v-card>
      </v-tabs-window-item>
    </v-tabs-window>
  </div>
</template>
