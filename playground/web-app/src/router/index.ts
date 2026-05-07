import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/playground',
    },
    {
      path: '/playground',
      name: 'playground',
      component: () => import('../views/PlaygroundView.vue'),
      meta: { title: 'Playground', icon: 'mdi-play-circle-outline' },
    },
    {
      path: '/profile-builder',
      name: 'profile-builder',
      component: () => import('../views/ProfileBuilderView.vue'),
      meta: { title: 'Profile Builder' },
    },
    {
      path: '/validation-plan',
      name: 'validation-plan',
      component: () => import('../views/ValidationPlanView.vue'),
      meta: { title: 'Validation Plan' },
    },
    // ── Node.js ──────────────────────────────────────────────
    {
      path: '/node',
      redirect: '/node/overview',
    },
    {
      path: '/node/overview',
      name: 'node-overview',
      component: () => import('../views/node/OverviewView.vue'),
      meta: { title: 'Overview', section: 'Node.js' },
    },
    {
      path: '/node/setup',
      name: 'node-setup',
      component: () => import('../views/node/SetupView.vue'),
      meta: { title: 'Setup', section: 'Node.js' },
    },
    {
      path: '/node/profiles',
      name: 'node-profiles',
      component: () => import('../views/node/ProfilesView.vue'),
      meta: { title: 'Profiles', section: 'Node.js' },
    },
    {
      path: '/node/interceptor',
      name: 'node-interceptor',
      component: () => import('../views/node/InterceptorView.vue'),
      meta: { title: 'Trace Interceptor', section: 'Node.js' },
    },
    {
      path: '/node/logger',
      name: 'node-logger',
      component: () => import('../views/node/LoggerView.vue'),
      meta: { title: 'Logger', section: 'Node.js' },
    },
    {
      path: '/node/config',
      name: 'node-config',
      component: () => import('../views/node/ConfigView.vue'),
      meta: { title: 'Configuration', section: 'Node.js' },
    },
    // ── Web ──────────────────────────────────────────────────
    {
      path: '/web',
      redirect: '/web/overview',
    },
    {
      path: '/web/overview',
      name: 'web-overview',
      component: () => import('../views/web/OverviewView.vue'),
      meta: { title: 'Overview', section: 'Web' },
    },
    {
      path: '/web/setup',
      name: 'web-setup',
      component: () => import('../views/web/SetupView.vue'),
      meta: { title: 'Setup', section: 'Web' },
    },
    {
      path: '/web/api',
      name: 'web-api',
      component: () => import('../views/web/ApiView.vue'),
      meta: { title: 'API Reference', section: 'Web' },
    },
    // ── Laravel ──────────────────────────────────────────────
    {
      path: '/laravel',
      redirect: '/laravel/overview',
    },
    {
      path: '/laravel/overview',
      name: 'laravel-overview',
      component: () => import('../views/laravel/OverviewView.vue'),
      meta: { title: 'Overview', section: 'Laravel' },
    },
    {
      path: '/laravel/setup',
      name: 'laravel-setup',
      component: () => import('../views/laravel/SetupView.vue'),
      meta: { title: 'Setup', section: 'Laravel' },
    },
    {
      path: '/laravel/middleware',
      name: 'laravel-middleware',
      component: () => import('../views/laravel/MiddlewareView.vue'),
      meta: { title: 'TraceRequest Middleware', section: 'Laravel' },
    },
    {
      path: '/laravel/logging',
      name: 'laravel-logging',
      component: () => import('../views/laravel/LoggingView.vue'),
      meta: { title: 'Logging', section: 'Laravel' },
    },
    {
      path: '/laravel/config',
      name: 'laravel-config',
      component: () => import('../views/laravel/ConfigView.vue'),
      meta: { title: 'Configuration', section: 'Laravel' },
    },
    // ── Test Plan ────────────────────────────────────────────
    {
      path: '/tests',
      redirect: '/tests/body-capture',
    },
    {
      path: '/tests/body-capture',
      name: 'tests-body-capture',
      component: () => import('../views/tests/BodyCaptureView.vue'),
      meta: { title: 'Body Capture', section: 'Test Plan' },
    },
    {
      path: '/tests/log-destination',
      name: 'tests-log-destination',
      component: () => import('../views/tests/LogDestinationView.vue'),
      meta: { title: 'Log Destination', section: 'Test Plan' },
    },
    {
      path: '/tests/distributed-trace',
      name: 'tests-distributed-trace',
      component: () => import('../views/tests/DistributedTraceView.vue'),
      meta: { title: 'Distributed Tracing', section: 'Test Plan' },
    },
    {
      path: '/tests/errors',
      name: 'tests-errors',
      component: () => import('../views/tests/ErrorsView.vue'),
      meta: { title: 'Error Handling', section: 'Test Plan' },
    },
    {
      path: '/tests/redaction',
      name: 'tests-redaction',
      component: () => import('../views/tests/RedactionView.vue'),
      meta: { title: 'Sensitive Data Redaction', section: 'Test Plan' },
    },
    {
      path: '/tests/identity-baggage',
      name: 'tests-identity-baggage',
      component: () => import('../views/tests/IdentityBaggageView.vue'),
      meta: { title: 'Identity & Baggage', section: 'Test Plan' },
    },
  ],
});
