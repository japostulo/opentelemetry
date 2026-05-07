<script setup lang="ts">
import { ref, onMounted } from 'vue';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import php from 'highlight.js/lib/languages/php';
import bash from 'highlight.js/lib/languages/bash';
import yaml from 'highlight.js/lib/languages/yaml';
import json from 'highlight.js/lib/languages/json';
import 'highlight.js/styles/github.css';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('php', php);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('json', json);

const props = defineProps<{
  code: string;
  language?: string;
  title?: string;
}>();

const highlighted = ref('');
const copied = ref(false);

onMounted(() => {
  const lang = props.language || 'typescript';
  try {
    highlighted.value = hljs.highlight(props.code.trim(), { language: lang }).value;
  } catch {
    highlighted.value = props.code.trim();
  }
});

function copyCode() {
  navigator.clipboard.writeText(props.code.trim());
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}
</script>

<template>
  <v-card variant="outlined" class="mb-4">
    <v-card-title v-if="title" class="text-body-2 font-weight-medium bg-grey-lighten-4 py-2 px-4 d-flex align-center">
      <v-icon size="small" class="mr-2">mdi-code-tags</v-icon>
      {{ title }}
      <v-spacer />
      <v-btn variant="text" size="x-small" :icon="copied ? 'mdi-check' : 'mdi-content-copy'" @click="copyCode" />
    </v-card-title>
    <v-card-text class="pa-0">
      <pre class="code-block pa-4 ma-0"><code v-html="highlighted" /></pre>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.code-block {
  background: #f6f8fa;
  overflow-x: auto;
  font-size: 0.85rem;
  line-height: 1.5;
  font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
}
</style>
