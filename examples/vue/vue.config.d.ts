/// <reference types="@vue/language-core" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// Ensure the NMBL plugin is recognized
// declare module '@nmbl/vue-language-plugin';