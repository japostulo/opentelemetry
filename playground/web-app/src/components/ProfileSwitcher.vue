<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { usePlaygroundProfile, type PlaygroundProfile, type ProfileName, type LogDestination } from '../composables/usePlaygroundProfile';

const { loading, error, configs, currentProfile, fetchAllConfigs, applyProfile } = usePlaygroundProfile();

const dialog = ref(false);
const applying = ref(false);
const successSnack = ref(false);

const form = ref<PlaygroundProfile>({
  profile: 'minimal',
  captureBody: null,
  captureResponse: null,
  logDestination: 'both',
});

const profiles: { value: ProfileName; label: string; description: string; color: string }[] = [
  { value: 'minimal', label: 'Minimal', description: 'Sem body capture • Instrumentações essenciais', color: 'green' },
  { value: 'standard', label: 'Standard', description: 'Body + response capture • Mais instrumentações', color: 'blue' },
  { value: 'verbose', label: 'Verbose', description: 'Tudo ativo • fs/net/dns + todos os spans', color: 'purple' },
  { value: 'custom', label: 'Custom', description: 'Configuração manual via overrides', color: 'orange' },
];

const profileColorMap: Record<string, string> = {
  minimal: 'green',
  standard: 'blue',
  verbose: 'purple',
  custom: 'orange',
};

const logDestinations: { value: LogDestination; label: string }[] = [
  { value: 'both', label: 'Both (Console + SigNoz)' },
  { value: 'console', label: 'Console only' },
  { value: 'signoz', label: 'SigNoz only' },
  { value: 'none', label: 'None (silenced)' },
];

onMounted(() => {
  fetchAllConfigs();
});

watch(currentProfile, (p) => {
  if (p && !dialog.value) {
    form.value = { ...p };
  }
});

function openDialog() {
  if (currentProfile.value) {
    form.value = { ...currentProfile.value };
  }
  dialog.value = true;
}

function onProfileSelect(name: ProfileName) {
  form.value.profile = name;
  // Reset overrides to profile defaults when selecting a named profile
  if (name !== 'custom') {
    form.value.captureBody = null;
    form.value.captureResponse = null;
  }
}

async function apply() {
  applying.value = true;
  await applyProfile(form.value);
  applying.value = false;
  if (!error.value) {
    dialog.value = false;
    successSnack.value = true;
  }
}

function profileColor(name?: string): string {
  return profileColorMap[name ?? ''] ?? 'grey';
}
</script>

<template>
  <!-- App Bar Profile Chip -->
  <v-chip
    :color="profileColor(currentProfile?.profile)"
    variant="outlined"
    size="small"
    class="mr-1"
    style="cursor: pointer;"
    :loading="loading"
    @click="openDialog"
  >
    <v-icon start size="x-small">mdi-tune</v-icon>
    {{ currentProfile?.profile ?? '...' }}
  </v-chip>

  <!-- Profile Switcher Dialog -->
  <v-dialog v-model="dialog" max-width="600">
    <v-card>
      <v-card-title class="d-flex align-center pa-4">
        <v-icon class="mr-2">mdi-tune</v-icon>
        Profile dos Serviços
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="dialog = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <!-- Status dos serviços -->
      <v-card-text class="pa-4 pb-0">
        <div class="d-flex gap-2 flex-wrap mb-4">
          <v-chip
            v-for="(cfg, svc) in configs"
            :key="svc"
            :color="profileColor(cfg.profile)"
            variant="tonal"
            size="small"
          >
            <v-icon start size="x-small">mdi-circle</v-icon>
            {{ svc }}: {{ cfg.profile }}
          </v-chip>
          <v-chip v-if="!Object.keys(configs).length" color="error" variant="tonal" size="small">
            Sem serviços conectados
          </v-chip>
        </div>

        <!-- Profile selector -->
        <p class="text-subtitle-2 font-weight-bold mb-2">Selecione o Profile</p>
        <v-row dense>
          <v-col v-for="p in profiles" :key="p.value" cols="6">
            <v-card
              :color="form.profile === p.value ? p.color : undefined"
              :variant="form.profile === p.value ? 'tonal' : 'outlined'"
              class="pa-3"
              style="cursor: pointer;"
              @click="onProfileSelect(p.value)"
            >
              <div class="d-flex align-center">
                <v-icon :color="p.color" class="mr-2" size="small">mdi-circle</v-icon>
                <strong class="text-body-2">{{ p.label }}</strong>
              </div>
              <p class="text-caption text-grey mt-1">{{ p.description }}</p>
            </v-card>
          </v-col>
        </v-row>

        <!-- Overrides -->
        <v-divider class="my-4" />
        <p class="text-subtitle-2 font-weight-bold mb-2">
          Overrides
          <v-chip size="x-small" variant="outlined" class="ml-1">env vars</v-chip>
        </p>
        <v-alert type="info" variant="tonal" density="compact" class="mb-3 text-caption">
          Overrides sobrescrevem o profile. Deixe em <strong>auto</strong> para usar o default do profile.
        </v-alert>

        <v-row dense>
          <v-col cols="6">
            <v-select
              v-model="form.captureBody"
              label="captureRequestBody"
              :items="[{ title: 'Auto (profile default)', value: null }, { title: 'true', value: true }, { title: 'false', value: false }]"
              density="compact"
              variant="outlined"
              hint="Span attributes body.*"
              persistent-hint
            />
          </v-col>
          <v-col cols="6">
            <v-select
              v-model="form.captureResponse"
              label="captureResponseBody"
              :items="[{ title: 'Auto (profile default)', value: null }, { title: 'true', value: true }, { title: 'false', value: false }]"
              density="compact"
              variant="outlined"
              hint="Span attributes response.*"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" class="mt-2">
            <v-select
              v-model="form.logDestination"
              label="LOG_DESTINATION"
              :items="logDestinations"
              item-title="label"
              item-value="value"
              density="compact"
              variant="outlined"
              hint="Onde os logs Pino são enviados"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">
          {{ error }}
        </v-alert>
      </v-card-text>

      <v-card-actions class="pa-4">
        <v-btn variant="text" @click="fetchAllConfigs(); dialog = false">Cancelar</v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :loading="applying"
          prepend-icon="mdi-check"
          @click="apply"
        >
          Aplicar em todos os serviços
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Success Snackbar -->
  <v-snackbar v-model="successSnack" color="success" timeout="3000">
    Profile atualizado com sucesso em todos os serviços!
  </v-snackbar>
</template>
