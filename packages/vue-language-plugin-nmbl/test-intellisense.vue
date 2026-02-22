<template lang="nmbl">
div#app.container.active
  p.text-primary {{ message }}
  button.btn.btn-primary(@click="handleClick") Click me
  span(class="highlight") Highlighted text
</template>

<script setup>
import { ref } from 'vue'

const message = ref('Hello World')

function handleClick() {
  console.log('Button clicked')
}
</script>

<style>
.container {
  padding: 20px;
}

.active {
  background: #f0f0f0;
}

.text-primary {
  color: blue;
}

.btn {
  padding: 10px;
}

.btn-primary {
  background: blue;
  color: white;
}

.highlight {
  background: yellow;
}
</style>
