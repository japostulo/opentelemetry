import { ref, computed, readonly } from 'vue';

export type ProfileName = 'minimal' | 'standard' | 'verbose' | 'custom';
export type LogDestination = 'both' | 'console' | 'signoz' | 'none';

export interface ServiceConfig {
  service: string;
  profile: string;
  captureBody: boolean | null;
  captureResponse: boolean | null;
  logDestination: string;
}

export interface PlaygroundProfile {
  profile: ProfileName;
  captureBody: boolean | null;
  captureResponse: boolean | null;
  logDestination: LogDestination;
}

export interface ApplyResult {
  service: string;
  ok: boolean;
  status?: number;
  error?: string;
  config?: ServiceConfig;
}

const SERVICES = [
  { name: 'nestjs', baseUrl: 'http://localhost:3010' },
  { name: 'express', baseUrl: 'http://localhost:3020' },
  { name: 'laravel', baseUrl: 'http://localhost:8085/api' },
];

const loading = ref(false);
const error = ref<string | null>(null);
const configs = ref<Record<string, ServiceConfig>>({});
const lastApplyResults = ref<ApplyResult[]>([]);

const currentProfile = computed<PlaygroundProfile | null>(() => {
  // Prefer NestJS as the seed for the form, but fall back to whichever
  // service answered first so the UI is still useful when one backend
  // is offline.
  const seed =
    configs.value['nestjs'] ??
    configs.value['express'] ??
    configs.value['laravel'];
  if (!seed) return null;
  return {
    profile: seed.profile as ProfileName,
    captureBody: seed.captureBody,
    captureResponse: seed.captureResponse,
    logDestination: seed.logDestination as LogDestination,
  };
});

/**
 * True only when all 3 services report the same effective profile +
 * overrides. Used by the UI to surface drift.
 */
const allInSync = computed<boolean>(() => {
  const entries = Object.values(configs.value);
  if (entries.length < SERVICES.length) return false;
  const first = entries[0];
  return entries.every(
    (c) =>
      c.profile === first.profile &&
      c.captureBody === first.captureBody &&
      c.captureResponse === first.captureResponse &&
      c.logDestination === first.logDestination,
  );
});

async function fetchAllConfigs(): Promise<void> {
  loading.value = true;
  error.value = null;
  const results: Record<string, ServiceConfig> = {};
  const failures: string[] = [];

  await Promise.allSettled(
    SERVICES.map(async (svc) => {
      try {
        const res = await fetch(`${svc.baseUrl}/admin/config`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          results[svc.name] = await res.json();
        } else {
          failures.push(`${svc.name}: HTTP ${res.status}`);
        }
      } catch (e) {
        failures.push(
          `${svc.name}: ${e instanceof Error ? e.message : 'unreachable'}`,
        );
      }
    }),
  );

  configs.value = results;
  if (failures.length) {
    error.value = `Falha ao consultar: ${failures.join(' | ')}`;
  }
  loading.value = false;
}

async function applyProfile(profile: PlaygroundProfile): Promise<ApplyResult[]> {
  loading.value = true;
  error.value = null;
  lastApplyResults.value = [];

  const body = {
    profile: profile.profile === 'custom' ? undefined : profile.profile,
    captureBody: profile.captureBody,
    captureResponse: profile.captureResponse,
    logDestination: profile.logDestination,
  };

  const results: ApplyResult[] = await Promise.all(
    SERVICES.map(async (svc): Promise<ApplyResult> => {
      try {
        const res = await fetch(`${svc.baseUrl}/admin/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          return {
            service: svc.name,
            ok: false,
            status: res.status,
            error: `HTTP ${res.status}`,
          };
        }
        const cfg = (await res.json()) as ServiceConfig;
        return { service: svc.name, ok: true, status: res.status, config: cfg };
      } catch (e) {
        return {
          service: svc.name,
          ok: false,
          error: e instanceof Error ? e.message : 'unreachable',
        };
      }
    }),
  );

  // Always re-read each service's actual /admin/config after the PUT so
  // the displayed state reflects ground truth (proves the change really
  // took effect end-to-end).
  await fetchAllConfigs();

  lastApplyResults.value = results;
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    error.value = failed
      .map((r) => `${r.service}: ${r.error ?? 'falhou'}`)
      .join(' | ');
  }
  loading.value = false;
  return results;
}

export function usePlaygroundProfile() {
  return {
    loading: readonly(loading),
    error: readonly(error),
    configs: readonly(configs),
    currentProfile,
    allInSync,
    lastApplyResults: readonly(lastApplyResults),
    fetchAllConfigs,
    applyProfile,
  };
}
