<script lang="ts">
  import Badge from './components/Badge.svelte';
  // import Button from './components/Button.svelte';

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

  function removeItem(index: number) {
    items = items.filter((_, i) => i !== index);
  }
</script>

<template lang="nmbl">
div#app
  h1 NMBL + Svelte Example
    Badge(text="Beta" color="blue" rounded)

  Button(
    label={loggedIn ? 'Log out' : 'Log in'}
    variant="primary"
    size="lg"
    onclick={toggle}
  )

  @if(loggedIn)
    p.welcome Welcome back!
    h2 Your items:
    p.item-count You have {items.length} items in your list.
    ul
      @each(items as item, i)
        li
          span.item-number {i + 1}.
          span.item-name {item}
          Badge(text="item" color="gray" outline)
          Button(label="×" variant="danger" size="sm" onclick={() => removeItem(i)})
    div.add-item
      input(type="text" bind:value={newItem} placeholder="New item...")
      Button(variant="secondary" disabled={!newItem.trim()} onclick={addItem})
        | Add
  @else
    p Please log in to see your items.
</template>

<style>
  #app {
    font-family: sans-serif;
    max-width: 600px;
    margin: 2rem auto;
    padding: 1rem;
  }
  h1 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .welcome {
    color: green;
    font-weight: bold;
  }
  .item-count {
    color: #666;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    margin-bottom: 0.25rem;
    background: #f5f5f5;
    border-radius: 4px;
  }
  .item-name {
    flex: 1;
  }
  .item-number {
    color: #999;
  }
  .add-item {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  input {
    flex: 1;
    padding: 0.25rem 0.5rem;
  }
</style>
