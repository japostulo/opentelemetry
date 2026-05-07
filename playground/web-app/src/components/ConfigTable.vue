<script setup lang="ts">
defineProps<{
  items: {
    name: string;
    type: string;
    default?: string;
    required?: boolean;
    description: string;
    envVar?: string;
  }[];
  title?: string;
}>();
</script>

<template>
  <v-card variant="outlined" class="mb-4">
    <v-card-title v-if="title" class="text-body-1 font-weight-bold py-3">
      {{ title }}
    </v-card-title>
    <v-table density="comfortable" hover>
      <thead>
        <tr>
          <th class="text-left font-weight-bold">Propriedade</th>
          <th class="text-left font-weight-bold">Tipo</th>
          <th class="text-left font-weight-bold">Default</th>
          <th class="text-left font-weight-bold">Descrição</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.name">
          <td>
            <code class="text-primary font-weight-medium">{{ item.name }}</code>
            <v-chip v-if="item.required" size="x-small" color="error" variant="flat" class="ml-1">required</v-chip>
            <div v-if="item.envVar" class="text-caption text-grey mt-1">
              <v-icon size="x-small">mdi-console</v-icon> {{ item.envVar }}
            </div>
          </td>
          <td><code class="text-grey-darken-1">{{ item.type }}</code></td>
          <td><code v-if="item.default" class="text-grey-darken-2">{{ item.default }}</code><span v-else class="text-grey">—</span></td>
          <td class="text-body-2">{{ item.description }}</td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>
