<script setup lang="ts">
import ConfigTable from '../../components/ConfigTable.vue';
import CodeBlock from '../../components/CodeBlock.vue';

const interceptorOptions = [
  { name: 'extraSensitiveFields', type: 'Iterable<string>', description: 'Campos adicionais a serem redatados (merge com DEFAULT_SENSITIVE_FIELDS)', envVar: '—' },
];

const capturedSpanAttrs = [
  { name: 'http.route', type: 'string', description: 'Rota registrada (ex: /users/:id)' },
  { name: 'http.method', type: 'string', description: 'Método HTTP (GET, POST, etc.)' },
  { name: 'http.status_code', type: 'number', description: 'Status code da resposta' },
  { name: 'http.duration_ms', type: 'number', description: 'Duração da request em ms' },
  { name: 'environment', type: 'string', description: 'Ambiente (OTEL_ENVIRONMENT ou APP_ENV)' },
  { name: 'query.*', type: 'string', description: 'Query params flattenados' },
  { name: 'params.*', type: 'string', description: 'Route params flattenados' },
  { name: 'body.*', type: 'string', description: 'Request body flattenado (se captureRequestBody=true)' },
  { name: 'response.*', type: 'string', description: 'Response body flattenado (se captureResponseBody=true)' },
  { name: 'user.id', type: 'string', description: 'ID do usuário (via identifyUser() em guard/middleware)' },
  { name: 'user.role', type: 'string', description: 'Role do usuário' },
  { name: 'user.type', type: 'string', description: 'Tipo: authenticated | anonymous | service' },
  { name: 'http.forwarded_for', type: 'string', description: 'X-Forwarded-For header' },
  { name: 'network.hop_count', type: 'number', description: 'Número de hops (proxies)' },
  { name: 'page.*', type: 'string', description: 'Baggage do frontend (página atual)' },
  { name: 'browser.*', type: 'string', description: 'Baggage do frontend (browser info)' },
  { name: 'error.message', type: 'string', description: 'Mensagem de erro (em caso de exceção)' },
  { name: 'error.type', type: 'string', description: 'Tipo do erro (nome da classe)' },
];
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">HaocTraceInterceptor</h1>
    <v-chip size="small" color="red" variant="flat" class="mb-4">NestJS</v-chip>

    <p class="text-body-1 mb-6">
      Interceptor NestJS que correlaciona cada request/response com o span ativo do OpenTelemetry.
      Captura body, query, params, identidade de usuário, headers de infraestrutura e baggage do frontend.
    </p>

    <v-divider class="mb-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Classe</h2>
    <v-card variant="outlined" class="mb-4 pa-4">
      <div class="d-flex align-center mb-2">
        <code class="text-h6 text-primary">HaocTraceInterceptor</code>
        <v-chip size="x-small" color="info" variant="flat" class="ml-2">@Injectable()</v-chip>
        <v-chip size="x-small" variant="outlined" class="ml-2">implements NestInterceptor</v-chip>
      </div>
      <p class="text-body-2">
        Arquivo: <code>packages/node/src/nestjs/trace.interceptor.ts</code>
      </p>
    </v-card>

    <h2 class="text-h5 font-weight-bold mb-3">Fluxo de Execução</h2>
    <v-card variant="outlined" class="pa-4 mb-4">
      <v-timeline density="compact" side="end">
        <v-timeline-item dot-color="blue" size="small">
          <div class="text-body-2"><strong>1. Recebe Request</strong> — Obtém span ativo, extrai route/method/traceId</div>
        </v-timeline-item>
        <v-timeline-item dot-color="blue" size="small">
          <div class="text-body-2"><strong>2. Verifica Profile</strong> — <code>getRuntimeProfile()</code> resolve profile + env overrides</div>
        </v-timeline-item>
        <v-timeline-item dot-color="blue" size="small">
          <div class="text-body-2"><strong>3. Ignora Rotas</strong> — Se rota match <code>ignoreRoutes</code>, passa direto</div>
        </v-timeline-item>
        <v-timeline-item dot-color="green" size="small">
          <div class="text-body-2"><strong>4. Enriquece Span</strong> — Seta atributos: route, query, params, body, user, hops, baggage</div>
        </v-timeline-item>
        <v-timeline-item dot-color="green" size="small">
          <div class="text-body-2"><strong>5. Log Request</strong> — Pino log com atributos flattenados (se logRequestBody)</div>
        </v-timeline-item>
        <v-timeline-item dot-color="amber" size="small">
          <div class="text-body-2"><strong>6. Executa Handler</strong> — <code>next.handle()</code> para o controller</div>
        </v-timeline-item>
        <v-timeline-item dot-color="green" size="small">
          <div class="text-body-2"><strong>7. Captura Response</strong> — Via <code>tap()</code>: status, duration, response body (se captureResponseBody)</div>
        </v-timeline-item>
        <v-timeline-item dot-color="red" size="small">
          <div class="text-body-2"><strong>8. Trata Erros</strong> — Via <code>catchError()</code>: error.message, error.type, recordException, span ERROR</div>
        </v-timeline-item>
      </v-timeline>
    </v-card>

    <h2 class="text-h5 font-weight-bold mb-3">Opções do Construtor</h2>
    <ConfigTable :items="interceptorOptions" />

    <h2 class="text-h5 font-weight-bold mb-3">Atributos Capturados no Span</h2>
    <ConfigTable :items="capturedSpanAttrs" title="Span Attributes" />

    <v-divider class="my-6" />

    <h2 class="text-h5 font-weight-bold mb-3">Uso</h2>
    <p class="text-body-2 mb-3">
      O interceptor é registrado automaticamente pelo <code>HaocLoggerModule.forRoot()</code> ou <code>bootstrapHaocApp()</code>.
      Não é necessário registrá-lo manualmente.
    </p>

    <h3 class="text-h6 mb-2">Acesso manual ao logger</h3>
    <CodeBlock language="typescript" :code="`import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class MyService {
  constructor(@InjectPinoLogger('MyService') private logger: PinoLogger) {}

  async process() {
    this.logger.info({ orderId: '123' }, 'Processing order');
  }
}`" />

    <h3 class="text-h6 mb-2 mt-4">Express Equivalente</h3>
    <p class="text-body-2 mb-3">
      Para Express, use <code>createTraceMiddleware()</code> que tem a mesma funcionalidade:
      captura de body, response body (via buffer de chunks), user identity, hop tracking e baggage propagation.
    </p>
    <CodeBlock language="typescript" :code="`import { createTraceMiddleware } from '@haocruz/opentelemetry/express';

app.use(createTraceMiddleware({
  extraSensitiveFields: ['cpf', 'rg'],
}));`" />
  </div>
</template>
