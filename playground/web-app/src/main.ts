import { initTracing, createVueErrorHandler } from '@haocruz/opentelemetry-web';
import { createApp } from 'vue';
import App from './App.vue';

initTracing({
  serviceName: 'playground-web',
  environment: 'playground',
  propagateTraceUrls: [/localhost/],
});

const app = createApp(App);
app.config.errorHandler = createVueErrorHandler();
app.mount('#app');
