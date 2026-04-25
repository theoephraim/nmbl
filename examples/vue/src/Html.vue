<script setup lang="ts">
import Badge from './components/Badge.vue';
import VButton from './components/VButton.vue';

const foo = 'bar';
function handleClick() {
  console.log('clicked');
}
</script>

<template>
  <div class="class1 class2" @click="handleClick"></div>
  <slot name="foo"></slot>
  <Badge text="Hello" color="blue" rounded />
  <VButton label="Click me" variant="primary" size="lg" @click="handleClick" />

</template>

<style scoped>
.class1 {
  color: red;
}
.class2 {
  font-size: 16px;
}
</style>