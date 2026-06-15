<script lang="ts">
  import Button from './components/Button.svelte';
  const loggedIn = true;
</script>

<template lang="nmbl">
div
  Button(
    label={loggedIn ? 'Log out' : 'Log in'}
  )

</template>
