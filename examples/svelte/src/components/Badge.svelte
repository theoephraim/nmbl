<script lang="ts">
  interface Props {
    text: string;
    color?: 'green' | 'blue' | 'red' | 'yellow' | 'gray';
    rounded?: boolean;
    outline?: boolean;
  }

  let { text, color = 'blue', rounded = false, outline = false }: Props = $props();
</script>

<template lang="nmbl">
span.badge(
  class:badge--rounded={rounded}
  class:badge--outline={outline}
  class="badge--{color}"
  title={text}
)
  {text}
</template>

<style>
  .badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .badge--rounded {
    border-radius: 9999px;
  }

  .badge--green { background-color: #10b981; color: white; }
  .badge--blue { background-color: #3b82f6; color: white; }
  .badge--red { background-color: #ef4444; color: white; }
  .badge--yellow { background-color: #f59e0b; color: white; }
  .badge--gray { background-color: #6b7280; color: white; }

  .badge--outline { background-color: transparent; border: 1px solid currentColor; }
  .badge--outline.badge--green { color: #10b981; }
  .badge--outline.badge--blue { color: #3b82f6; }
  .badge--outline.badge--red { color: #ef4444; }
  .badge--outline.badge--yellow { color: #f59e0b; }
  .badge--outline.badge--gray { color: #6b7280; }
</style>
