<script setup lang="ts">
const foo = 'bar';
function handleClick() {
  console.log('clicked');
}
</script>

<template>
  <div class="class1 class2" @click="handleClick"></div>
  <slot name="foo"></slot>
</template>

<style scoped>
.class1 {
  color: red;
}
.class2 {
  font-size: 16px;
}
</style>