<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import ProfilePreview from '../components/ProfilePreview.vue';
import { usePlaygroundProfile, type ProfileName, type LogDestination } from '../composables/usePlaygroundProfile';

const {
  loading,
  error,
  configs,
  currentProfile,
  allInSync,
  lastApplyResults,
  fetchAllConfigs,
  applyProfile,
} = usePlaygroundProfile();

onMounted(fetchAllConfigs);

// ── Tabs ─────────────────────────────────────────────────────────────────────
const tab = ref('configure');

// ── Form state ────────────────────────────────────────────────────────────────
const selectedProfile = ref<ProfileName>('minimal');
const captureBody = ref<boolean | null>(null);
const captureResponse = ref<boolean | null>(null);
const logDestination = ref<LogDestination>('both');
const applySuccess = ref(false);
const applyLoading = ref(false);

watch(currentProfile, (p) => {
  if (p) {
    selectedProfile.value = p.profile;
    captureBody.value = p.captureBody;
    captureResponse.value = p.captureResponse;
    logDestination.value = p.logDestination;
  }
}, { immediate: true });

const profileOptions = [
  { value: 'minimal' as ProfileName, label: 'Minimal', color: 'green', icon: 'mdi-leaf', desc: 'Produção — ruído zero. Apenas spans essenciais, sem body capture.' },
  { value: 'standard' as ProfileName, label: 'Standard', color: 'blue', icon: 'mdi-balance', desc: 'Staging/QA — body capture ativo, instrumentações de DB estendidas.' },
  { value: 'verbose' as ProfileName, label: 'Verbose', color: 'purple', icon: 'mdi-eye', desc: 'Debug — tudo visível, incluindo fs/net/dns e todos os spans Express.' },
];

const logDestOptions = [
  { value: 'both' as LogDestination, label: 'Both', desc: 'Console + SigNoz (OTLP)' },
  { value: 'console' as LogDestination, label: 'Console', desc: 'Apenas stdout/stderr' },
  { value: 'signoz' as LogDestination, label: 'SigNoz', desc: 'Apenas OTLP (sem console)' },
  { value: 'none' as LogDestination, label: 'None', desc: 'Logs silenciados' },
];

const boolOptions = [
  { title: 'Auto (profile default)', value: null },
  { title: 'true — ativo', value: true },
  { title: 'false — desativado', value: false },
];

const effectiveCaptures = computed(() => {
  const profileDefaults: Record<ProfileName, { body: boolean; response: boolean }> = {
    minimal: { body: false, response: false },
    standard: { body: true, response: true },
    verbose: { body: true, response: true },
    custom: { body: false, response: false },
  };
  const defaults = profileDefaults[selectedProfile.value];
  return {
    body: captureBody.value !== null ? captureBody.value : defaults.body,
    response: captureResponse.value !== null ? captureResponse.value : defaults.response,
  };
});

// Helper para calcular valor efetivo de capture considerando profile defaults
function getEffectiveCaptureValue(serviceConfig: any, field: 'captureBody' | 'captureResponse'): boolean {
  // Se há override explícito (true/false), usar esse valor
  if (serviceConfig[field] !== null) {
    return serviceConfig[field];
  }
  
  // Se é null, usar o default do profile
  const profileDefaults: Record<string, { captureBody: boolean; captureResponse: boolean }> = {
    minimal: { captureBody: false, captureResponse: false },
    standard: { captureBody: true, captureResponse: true },
    verbose: { captureBody: true, captureResponse: true },
  };
  
  const defaults = profileDefaults[serviceConfig.profile] || { captureBody: false, captureResponse: false };
  return defaults[field];
}

const generatedEnvVars = computed(() => {
  const lines: string[] = [
    `HAOC_OTEL_PROFILE=${selectedProfile.value}`,
  ];
  if (captureBody.value !== null) lines.push(`HAOC_OTEL_CAPTURE_BODY=${captureBody.value}`);
  if (captureResponse.value !== null) lines.push(`HAOC_OTEL_CAPTURE_RESPONSE=${captureResponse.value}`);
  lines.push(`LOG_DESTINATION=${logDestination.value}`);
  return lines.join('\n');
});

async function applyAll() {
  applyLoading.value = true;
  applySuccess.value = false;
  const results = await applyProfile({
    profile: selectedProfile.value,
    captureBody: captureBody.value,
    captureResponse: captureResponse.value,
    logDestination: logDestination.value,
  });
  applyLoading.value = false;
  applySuccess.value = results.every((r) => r.ok);
}

function resetToProfile(name: ProfileName) {
  selectedProfile.value = name;
  captureBody.value = null;
  captureResponse.value = null;
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4 font-weight-bold">Profile Builder</h1>
      <v-spacer />
      <v-btn
        variant="outlined"
        prepend-icon="mdi-refresh"
        :loading="loading"
        @click="fetchAllConfigs"
      >
        Recarregar status
      </v-btn>
    </div>

    <v-alert type="info" variant="tonal" density="compact" class="mb-6">
      Configure o profile e os overrides, aplique em todos os serviços em tempo real e veja o preview do que cada configuração faz.
      <br>
      <strong>Nota:</strong> Instrumentações (DB, fs, net) e sampleRatio só mudam com rebuild dos containers.
    </v-alert>

    <!-- Status atual dos serviços -->
    <v-card variant="outlined" class="mb-6">
      <v-card-title class="pa-4 pb-2">Status atual dos serviços</v-card-title>
      <v-card-text class="pa-4 pt-0">
        <v-row dense>
          <v-col v-for="(cfg, svc) in configs" :key="svc" cols="12" md="4">
            <v-card variant="tonal" :color="cfg.profile === 'minimal' ? 'green' : cfg.profile === 'standard' ? 'blue' : 'purple'" class="pa-3">
              <div class="d-flex align-center mb-1">
                <v-icon size="small" class="mr-1">
                  {{ svc === 'laravel' ? 'mdi-language-php' : svc === 'nestjs' ? 'mdi-nodejs' : 'mdi-lightning-bolt' }}
                </v-icon>
                <strong class="text-body-2">{{ svc }}</strong>
                <v-chip size="x-small" class="ml-auto" variant="flat">{{ cfg.profile }}</v-chip>
              </div>
              <div class="text-caption">
                <span :class="getEffectiveCaptureValue(cfg, 'captureBody') ? 'text-success' : 'text-error'">
                  {{ getEffectiveCaptureValue(cfg, 'captureBody') ? '✓' : '✗' }} captureBody
                </span>
                &nbsp;|&nbsp;
                <span :class="getEffectiveCaptureValue(cfg, 'captureResponse') ? 'text-success' : 'text-error'">
                  {{ getEffectiveCaptureValue(cfg, 'captureResponse') ? '✓' : '✗' }} captureResponse
                </span>
                <br>
                <span class="text-grey">log: {{ cfg.logDestination }}</span>
              </div>
            </v-card>
          </v-col>
          <v-col v-if="!Object.keys(configs).length" cols="12">
            <v-alert type="warning" variant="tonal" density="compact">
              Nenhum serviço conectado. Certifique-se de que os containers estão rodando.
            </v-alert>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="configure">Configurar</v-tab>
      <v-tab value="preview">Preview</v-tab>
      <v-tab value="envvars">Env Vars</v-tab>
    </v-tabs>

    <v-tabs-window v-model="tab">
      <!-- ── CONFIGURE ──────────────────────────────────────────────────── -->
      <v-tabs-window-item value="configure">
        <v-row>
          <v-col cols="12" md="6">
            <v-card variant="outlined" class="pa-4">
              <h3 class="text-h6 mb-3">1. Selecione o Profile Base</h3>
              <v-row dense>
                <v-col v-for="p in profileOptions" :key="p.value" cols="12">
                  <v-card
                    :variant="selectedProfile === p.value ? 'tonal' : 'outlined'"
                    :color="selectedProfile === p.value ? p.color : undefined"
                    class="pa-3"
                    style="cursor: pointer;"
                    @click="resetToProfile(p.value)"
                  >
                    <div class="d-flex align-center">
                      <v-icon :color="p.color" class="mr-2">{{ p.icon }}</v-icon>
                      <div>
                        <strong class="text-body-2">{{ p.label }}</strong>
                        <div class="text-caption text-grey">{{ p.desc }}</div>
                      </div>
                      <v-icon v-if="selectedProfile === p.value" class="ml-auto" :color="p.color">mdi-check-circle</v-icon>
                    </div>
                  </v-card>
                </v-col>
              </v-row>
            </v-card>
          </v-col>

          <v-col cols="12" md="6">
            <v-card variant="outlined" class="pa-4">
              <h3 class="text-h6 mb-3">2. Overrides (opcional)</h3>
              <p class="text-caption text-grey mb-3">
                Sobrescrevem o profile selecionado. Deixe em "Auto" para usar o default do profile.
              </p>

              <v-select
                v-model="captureBody"
                label="captureRequestBody"
                :items="boolOptions"
                density="compact"
                variant="outlined"
                class="mb-3"
                hint="Adiciona body.* como atributos do span (com redação de campos sensíveis)"
                persistent-hint
              >
                <template #prepend-inner>
                  <v-icon size="small" :color="effectiveCaptures.body ? 'success' : 'error'">
                    {{ effectiveCaptures.body ? 'mdi-check-circle' : 'mdi-close-circle' }}
                  </v-icon>
                </template>
              </v-select>

              <v-select
                v-model="captureResponse"
                label="captureResponseBody"
                :items="boolOptions"
                density="compact"
                variant="outlined"
                class="mb-3"
                hint="Adiciona response.* como atributos do span"
                persistent-hint
              >
                <template #prepend-inner>
                  <v-icon size="small" :color="effectiveCaptures.response ? 'success' : 'error'">
                    {{ effectiveCaptures.response ? 'mdi-check-circle' : 'mdi-close-circle' }}
                  </v-icon>
                </template>
              </v-select>

              <h3 class="text-h6 mb-2 mt-4">3. Log Destination</h3>
              <v-btn-toggle v-model="logDestination" mandatory variant="outlined" class="flex-wrap" style="width: 100%">
                <v-btn v-for="opt in logDestOptions" :key="opt.value" :value="opt.value" size="small" class="flex-grow-1">
                  {{ opt.label }}
                </v-btn>
              </v-btn-toggle>
              <p class="text-caption text-grey mt-1">
                {{ logDestOptions.find(o => o.value === logDestination)?.desc }}
              </p>
            </v-card>

            <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">
              {{ error }}
            </v-alert>

            <v-btn
              block
              color="primary"
              variant="flat"
              size="large"
              class="mt-4"
              prepend-icon="mdi-rocket-launch"
              :loading="applyLoading"
              @click="applyAll"
            >
              Aplicar em todos os serviços
            </v-btn>
            <p class="text-caption text-center text-grey mt-1">
              Aplica imediatamente via /admin/config sem restart dos containers
            </p>

            <!-- Per-service apply outcome (proves the change reached each backend) -->
            <v-card v-if="lastApplyResults.length" variant="outlined" class="mt-3 pa-3">
              <div class="text-caption text-grey mb-2">
                Resultado do último apply
                <v-chip
                  v-if="!allInSync"
                  size="x-small"
                  color="warning"
                  variant="tonal"
                  class="ml-2"
                >
                  drift detectado
                </v-chip>
              </div>
              <div v-for="r in lastApplyResults" :key="r.service" class="d-flex align-center text-caption mb-1">
                <v-icon
                  size="small"
                  :color="r.ok ? 'success' : 'error'"
                  class="mr-2"
                >
                  {{ r.ok ? 'mdi-check-circle' : 'mdi-alert-circle' }}
                </v-icon>
                <strong>{{ r.service }}</strong>
                <span class="ml-2 text-grey">
                  {{ r.ok ? `HTTP ${r.status} — profile=${r.config?.profile} log=${r.config?.logDestination}` : (r.error ?? 'falha') }}
                </span>
              </div>
            </v-card>

            <v-alert
              v-if="applySuccess && allInSync"
              type="success"
              variant="tonal"
              density="compact"
              class="mt-3"
            >
              Profile sincronizado nos 3 serviços.
            </v-alert>
          </v-col>
        </v-row>
      </v-tabs-window-item>

      <!-- ── PREVIEW ────────────────────────────────────────────────────── -->
      <v-tabs-window-item value="preview">
        <v-alert type="info" variant="tonal" density="compact" class="mb-4">
          Preview do comportamento do profile <strong>{{ selectedProfile }}</strong> por tipo de serviço.
          Os overrides de captureBody/captureResponse são mostrados na aba "Configurar".
        </v-alert>
        <ProfilePreview
          v-if="selectedProfile !== 'custom'"
          :profile="selectedProfile as 'minimal' | 'standard' | 'verbose'"
        />
        <v-alert v-else type="warning" variant="tonal">
          Profile custom — veja os overrides configurados na aba "Configurar".
        </v-alert>
      </v-tabs-window-item>

      <!-- ── ENV VARS ───────────────────────────────────────────────────── -->
      <v-tabs-window-item value="envvars">
        <v-card variant="outlined" class="pa-4">
          <h3 class="text-h6 mb-3">Env vars equivalentes para docker-compose.yml</h3>
          <p class="text-body-2 mb-3 text-grey">
            Adicione ao bloco <code>environment:</code> de cada serviço para persistir a configuração após restart dos containers.
          </p>
          <pre class="pa-4 bg-grey-darken-4 rounded text-yellow-lighten-3"
            style="font-family: monospace; font-size: 13px; white-space: pre;"
          >{{ generatedEnvVars }}</pre>
          <v-alert type="warning" variant="tonal" density="compact" class="mt-3">
            <strong>Instrumentações</strong> (fs, net, dns) e <strong>sampleRatio</strong> requerem rebuild:
            <code>docker compose up -d --build</code>
          </v-alert>
        </v-card>
      </v-tabs-window-item>
    </v-tabs-window>

    <!-- Success snack -->
    <v-snackbar v-model="applySuccess" color="success" timeout="3000">
      Profile "{{ selectedProfile }}" aplicado com sucesso em todos os serviços!
    </v-snackbar>
  </div>
</template>
