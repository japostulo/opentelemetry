<script setup lang="ts">
defineProps<{
  profiles: {
    feature: string;
    minimal: string;
    standard: string;
    verbose: string;
    description?: string;
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
          <th class="text-left font-weight-bold">Feature</th>
          <th class="text-center font-weight-bold">
            <v-chip size="small" color="success" variant="flat">minimal</v-chip>
          </th>
          <th class="text-center font-weight-bold">
            <v-chip size="small" color="info" variant="flat">standard</v-chip>
          </th>
          <th class="text-center font-weight-bold">
            <v-chip size="small" color="warning" variant="flat">verbose</v-chip>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in profiles" :key="p.feature">
          <td>
            <span class="font-weight-medium">{{ p.feature }}</span>
            <div v-if="p.description" class="text-caption text-grey">{{ p.description }}</div>
          </td>
          <td class="text-center">
            <v-icon v-if="p.minimal === 'true'" color="success" size="small">mdi-check-circle</v-icon>
            <v-icon v-else-if="p.minimal === 'false'" color="grey" size="small">mdi-close-circle-outline</v-icon>
            <span v-else class="text-body-2">{{ p.minimal }}</span>
          </td>
          <td class="text-center">
            <v-icon v-if="p.standard === 'true'" color="success" size="small">mdi-check-circle</v-icon>
            <v-icon v-else-if="p.standard === 'false'" color="grey" size="small">mdi-close-circle-outline</v-icon>
            <span v-else class="text-body-2">{{ p.standard }}</span>
          </td>
          <td class="text-center">
            <v-icon v-if="p.verbose === 'true'" color="success" size="small">mdi-check-circle</v-icon>
            <v-icon v-else-if="p.verbose === 'false'" color="grey" size="small">mdi-close-circle-outline</v-icon>
            <span v-else class="text-body-2">{{ p.verbose }}</span>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>
