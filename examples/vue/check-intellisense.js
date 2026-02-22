#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔍 Checking NMBL Vue Intellisense Setup...\n');

const checks = [];

// Check 1: Vue language plugin installed
const pluginPath = resolve('node_modules/@nmbl/vue-language-plugin/dist/index.cjs');
if (existsSync(pluginPath)) {
  checks.push('✅ Vue language plugin is installed');
} else {
  checks.push('❌ Vue language plugin not found. Run: bun install');
}

// Check 2: TypeScript config has plugin configured
const tsconfigPath = resolve('tsconfig.json');
if (existsSync(tsconfigPath)) {
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
  if (tsconfig.vueCompilerOptions?.plugins?.includes('@nmbl/vue-language-plugin')) {
    checks.push('✅ TypeScript config has NMBL plugin configured');
  } else {
    checks.push('❌ TypeScript config missing NMBL plugin configuration');
  }
} else {
  checks.push('❌ tsconfig.json not found');
}

// Check 3: VSCode settings
const vscodeSettingsPath = resolve('.vscode/settings.json');
if (existsSync(vscodeSettingsPath)) {
  const settings = JSON.parse(readFileSync(vscodeSettingsPath, 'utf-8'));
  if (settings['typescript.tsdk']) {
    checks.push('✅ VSCode TypeScript SDK configured');
  } else {
    checks.push('⚠️  VSCode TypeScript SDK not configured (optional but recommended)');
  }
} else {
  checks.push('⚠️  No .vscode/settings.json found');
}

// Check 4: Vue packages
const vuePackages = [
  '@vue/language-core',
  'vue',
  '@vitejs/plugin-vue'
];

for (const pkg of vuePackages) {
  if (existsSync(resolve(`node_modules/${pkg}`))) {
    checks.push(`✅ ${pkg} is installed`);
  } else {
    checks.push(`❌ ${pkg} is not installed`);
  }
}

// Print results
checks.forEach(check => console.log(check));

console.log('\n📝 Next Steps:');
console.log('1. Make sure you have Vue - Official (Volar) extension installed in VSCode');
console.log('2. Select "Use Workspace Version" for TypeScript (Cmd+Shift+P → "TypeScript: Select TypeScript Version")');
console.log('3. Restart VSCode or reload the window (Cmd+R / Ctrl+R)');
console.log('4. Open a .vue file with <template lang="nmbl"> to test intellisense');

console.log('\n🐛 If intellisense still doesn\'t work:');
console.log('- Check the Vue Language Server output (View → Output → Vue Language Server)');
console.log('- Try: Cmd+Shift+P → "Vue: Restart Vue Server"');
console.log('- Ensure you opened the examples/vue folder directly in VSCode (not the monorepo root)');