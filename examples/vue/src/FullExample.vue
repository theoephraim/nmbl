<script setup lang="ts">
import { ref } from 'vue';
import Badge from './components/Badge.vue';
import VButton from './components/VButton.vue';

// A single component that exercises every NMBL feature, so the compiler
// output and the IDE (highlighting / intellisense) can be verified at a glance.
const title = 'NMBL + Vue — Full Feature Tour';
const show = ref(true);
const fruits = ref(['Apple', 'Banana', 'Cherry']);

function toggle() {
  show.value = !show.value;
}
</script>

<template lang="nmbl">
section.full-example
  //! ── vars within content + a custom component ──────────────────
  h1.fe-title
    | {{ title }}
    Badge(text="Vue" color="green" rounded)

  p.fe-sub There are {{ fruits.length }} fruits.

  //! ── embedded markdown (built-in CommonMark + GFM filter) ───────
  div.fe-prose:md
    ## About this example

    This file exercises **every** NMBL feature: control flow, two loop
    styles, `{{ }}` interpolation, embedded markdown, and a
    [custom component](https://nmbl.tools).

    - bold, _italic_, and `code`
    - a [link](https://nmbl.tools)

  VButton(label="Toggle list" variant="primary" size="sm" @click="toggle")

  //! ── idiomatic Vue: native v-if / v-for pass-through attributes ─
  div.fe-idiomatic(v-if="show")
    h2 Idiomatic Vue (v-if / v-for)
    ul.fe-list
      li(v-for="(fruit, i) in fruits" :key="fruit")
        span.fe-num {{ i + 1 }}.
        span.fe-name {{ fruit }}
        Badge(:text="fruit" color="blue" outline)
  div.fe-empty(v-else)
    p The list is hidden.

  //! ── non-idiomatic / portable: @each compiles to <template v-for> ─
  div.fe-portable
    h2 Portable @each (of-form)
    ul.fe-list
      @each(fruit, i of fruits :key="fruit")
        li
          span.fe-num {{ i + 1 }}.
          span.fe-name {{ fruit }}
</template>

<style scoped>
.full-example {
  max-width: 600px;
  margin: 2rem auto;
  padding: 1.5rem;
  border-top: 4px solid #42b883;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.fe-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.fe-sub {
  color: #666;
}
.fe-prose {
  background: #f6f8fa;
  border-radius: 6px;
  padding: 0.5rem 1rem;
}
.fe-list {
  list-style: none;
  padding: 0;
}
.fe-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
}
.fe-num {
  color: #999;
}
.fe-name {
  flex: 0 0 auto;
}
</style>
