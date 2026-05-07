<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import ProfileSwitcher from './components/ProfileSwitcher.vue';

const router = useRouter();
const route = useRoute();
const drawer = ref(true);
const rail = ref(false);

interface NavItem {
  title: string;
  icon: string;
  to?: string;
  children?: { title: string; to: string }[];
}

const navItems: NavItem[] = [
  {
    title: 'Playground',
    icon: 'mdi-play-circle-outline',
    to: '/playground',
  },
  {
    title: 'Profile Builder',
    icon: 'mdi-tune-variant',
    to: '/profile-builder',
  },
  {
    title: 'Validation Plan',
    icon: 'mdi-clipboard-check-outline',
    to: '/validation-plan',
  },
  {
    title: 'Node.js',
    icon: 'mdi-nodejs',
    children: [
      { title: 'Overview', to: '/node/overview' },
      { title: 'Setup', to: '/node/setup' },
      { title: 'Profiles', to: '/node/profiles' },
      { title: 'Trace Interceptor', to: '/node/interceptor' },
      { title: 'Logger', to: '/node/logger' },
      { title: 'Configuration', to: '/node/config' },
    ],
  },
  {
    title: 'Web',
    icon: 'mdi-web',
    children: [
      { title: 'Overview', to: '/web/overview' },
      { title: 'Setup', to: '/web/setup' },
      { title: 'API Reference', to: '/web/api' },
    ],
  },
  {
    title: 'Laravel',
    icon: 'mdi-language-php',
    children: [
      { title: 'Overview', to: '/laravel/overview' },
      { title: 'Setup', to: '/laravel/setup' },
      { title: 'Middleware', to: '/laravel/middleware' },
      { title: 'Logging', to: '/laravel/logging' },
      { title: 'Configuration', to: '/laravel/config' },
    ],
  },
  {
    title: 'Test Plan',
    icon: 'mdi-test-tube',
    children: [
      { title: 'Body Capture', to: '/tests/body-capture' },
      { title: 'Log Destination', to: '/tests/log-destination' },
      { title: 'Distributed Tracing', to: '/tests/distributed-trace' },
      { title: 'Error Handling', to: '/tests/errors' },
      { title: 'Redaction', to: '/tests/redaction' },
      { title: 'Identity & Baggage', to: '/tests/identity-baggage' },
    ],
  },
];

const breadcrumbs = computed(() => {
  const items: { title: string; to?: string; disabled?: boolean }[] = [];
  const section = route.meta?.section as string | undefined;
  const title = route.meta?.title as string | undefined;

  if (section) {
    const sectionMap: Record<string, string> = {
      'Node.js': '/node/overview',
      'Web': '/web/overview',
      'Laravel': '/laravel/overview',
      'Test Plan': '/tests/body-capture',
    };
    items.push({ title: section, to: sectionMap[section] });
  }
  if (title) {
    items.push({ title, disabled: true });
  }
  return items;
});

function isActive(item: NavItem): boolean {
  if (item.to) return route.path === item.to;
  return item.children?.some(c => route.path === c.to) ?? false;
}

function isChildActive(to: string): boolean {
  return route.path === to;
}
</script>

<template>
  <v-app>
    <!-- App Bar -->
    <v-app-bar color="primary" density="comfortable" elevation="2">
      <v-app-bar-nav-icon @click="drawer = !drawer" />
      <v-toolbar-title class="font-weight-bold">
        HAOC OpenTelemetry
      </v-toolbar-title>
      <v-spacer />
      <ProfileSwitcher />
      <v-chip variant="outlined" size="small" class="mr-2" color="white">
        v1.2.0
      </v-chip>
      <v-btn icon href="http://localhost:3301" target="_blank" title="Open SigNoz">
        <v-icon>mdi-chart-timeline-variant</v-icon>
      </v-btn>
    </v-app-bar>

    <!-- Navigation Drawer -->
    <v-navigation-drawer v-model="drawer" :rail="rail" permanent width="280">
      <v-list-item
        prepend-icon="mdi-signal-variant"
        title="OpenTelemetry"
        subtitle="Playground & Docs"
        nav
      >
        <template v-slot:append>
          <v-btn variant="text" :icon="rail ? 'mdi-chevron-right' : 'mdi-chevron-left'"
            @click.stop="rail = !rail" />
        </template>
      </v-list-item>

      <v-divider />

      <v-list density="compact" nav>
        <template v-for="item in navItems" :key="item.title">
          <!-- Single item (no children) -->
          <v-list-item v-if="!item.children"
            :to="item.to"
            :prepend-icon="item.icon"
            :title="item.title"
            :active="isActive(item)"
            color="primary"
            rounded="xl"
          />

          <!-- Group with children -->
          <v-list-group v-else :value="item.title">
            <template v-slot:activator="{ props }">
              <v-list-item v-bind="props"
                :prepend-icon="item.icon"
                :title="item.title"
                :active="isActive(item)"
                color="primary"
              />
            </template>
            <v-list-item v-for="child in item.children" :key="child.to"
              :to="child.to"
              :title="child.title"
              :active="isChildActive(child.to)"
              color="primary"
              rounded="xl"
              class="pl-8"
            />
          </v-list-group>
        </template>
      </v-list>
    </v-navigation-drawer>

    <!-- Main Content -->
    <v-main>
      <v-container fluid class="pa-6">
        <!-- Breadcrumbs -->
        <v-breadcrumbs v-if="breadcrumbs.length" :items="breadcrumbs" class="pa-0 mb-4">
          <template v-slot:divider>
            <v-icon>mdi-chevron-right</v-icon>
          </template>
        </v-breadcrumbs>

        <router-view />
      </v-container>
    </v-main>
  </v-app>
</template>
