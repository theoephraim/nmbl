<script setup lang="ts">
import Badge from './components/Badge.vue';
import VButton from './components/VButton.vue';

const foo = 'bar';

function handleClick() {
  console.log('clicked');
}
</script>

<template lang="nmbl">
div
  div.class1
  VButton(label="Click me" variant="primary" size="lg" @click="handleClick")
  VButton(
    label="Click me"
    variant="primary"
    size="lg"
    @click="handleClick"
  )
  Badge(text="Hello" color="blue" rounded)

</template>

<style scoped>
.class1 {
  color: red;
}
.class2 {
  font-size: 16px;
}
</style>