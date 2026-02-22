<script lang="ts">
  let loggedIn = $state(false);
  let items = $state(['Apple', 'Banana', 'Cherry']);
  let newItem = $state('');

  function toggle() {
    loggedIn = !loggedIn;
  }

  function addItem() {
    if (newItem.trim()) {
      items = [...items, newItem.trim()];
      newItem = '';
    }
  }
</script>

<template lang="nmbl">
div#app
  h1 NMBL + Svelte Example
  button(onclick={toggle})
    | {loggedIn ? 'Log out' : 'Log in'}
  {#if loggedIn}
    p.welcome Welcome back!
    h2 Your items:
    ul
      {#each items as item, i}
        li {i + 1}. {item}
    div.add-item
      input(type="text" bind:value={newItem} placeholder="New item...")
      button(onclick={addItem}) Add
  {:else}
    p Please log in to see your items.
</template>

<style>
  #app {
    font-family: sans-serif;
    max-width: 600px;
    margin: 2rem auto;
    padding: 1rem;
  }
  .welcome {
    color: green;
    font-weight: bold;
  }
  .add-item {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  input {
    padding: 0.25rem 0.5rem;
  }
  button {
    padding: 0.25rem 0.75rem;
    cursor: pointer;
  }
</style>
