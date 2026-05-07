import { initTracing, createVueErrorHandler } from '@haocruz/opentelemetry-web';
import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import App from './App.vue';
import { router } from './router';

initTracing({
  serviceName: 'playground-web',
  environment: 'playground',
  profile: 'minimal',
  apiUrls: [/localhost:(3010|3020|8085)/],
});

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#1565C0',
          secondary: '#424242',
          accent: '#7C4DFF',
          error: '#D32F2F',
          warning: '#F57C00',
          info: '#0288D1',
          success: '#388E3C',
          surface: '#FFFFFF',
          background: '#FAFAFA',
        },
      },
    },
  },
});

const app = createApp(App);
app.config.errorHandler = createVueErrorHandler();
app.use(vuetify);
app.use(router);
app.mount('#app');
