<script lang="ts">
  import Badge from './components/Badge.svelte';
  import Button from './components/Button.svelte';

  // A single component that exercises every NMBL feature, so the compiler
  // output and the IDE (highlighting / intellisense) can be verified at a glance.
  const title = 'NMBL + Svelte — Full Feature Tour';
  let show = $state(true);
  let fruits = $state(['Apple', 'Banana', 'Cherry']);
</script>

<template lang="nmbl">
section.full-example
  //! ── vars within content + a custom component ──────────────────
  h1.fe-title
    | {title}
    Badge(text="Svelte" color="red" rounded)

  p.fe-sub There are {fruits.length} fruits.

  //! ── embedded markdown (built-in CommonMark + GFM filter) ───────
  div.fe-prose:md
    ## About this example

    This file exercises **every** NMBL feature: control flow, two loop
    styles, `{ }` interpolation, embedded markdown, and a
    [custom component](https://nmbl.tools).

    - bold, _italic_, and `code`
    - a [link](https://nmbl.tools)

  Button(label="Toggle list" variant="primary" size="sm" onclick={() => (show = !show)})

  //! ── idiomatic Svelte: @each in Svelte's `as` form ─────────────
  @if(show)
    div.fe-idiomatic
      h2 Idiomatic Svelte @each (as-form)
      ul.fe-list
        @each(fruits as fruit, i (fruit))
          li
            span.fe-num {i + 1}.
            span.fe-name {fruit}
            Badge(text={fruit} color="blue" outline)
  @else
    p.fe-empty The list is hidden.

  //! ── non-idiomatic / portable: the canonical `of` form ─────────
  div.fe-portable
    h2 Portable @each (of-form)
    ul.fe-list
      @each(fruit, i of fruits :key="fruit")
        li
          span.fe-num {i + 1}.
          span.fe-name {fruit}
</template>

<style>
  .full-example {
    max-width: 600px;
    margin: 2rem auto;
    padding: 1.5rem;
    border-top: 4px solid #ff3e00;
    font-family: sans-serif;
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
</style>
