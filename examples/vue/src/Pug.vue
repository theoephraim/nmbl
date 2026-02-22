<script setup lang="ts">
const foo = 'bar';
</script>

<template lang="pug">
div
  div.class1.class2(:attr1="foo")
    div.class1.class2
    p#idtest
</template>

<style scoped>
#idtest {
  color: blue;
}

.class1 {
  color: red;
}
.class2 {
  font-size: 16px;
}
</style>