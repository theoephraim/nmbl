<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label?: string;
    variant?: 'primary' | 'secondary' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  }

  let { label, variant = 'primary', size = 'md', disabled = false, onclick, children }: Props = $props();
</script>

<template lang="nmbl">
button.btn(
  class="btn--{variant} btn--{size}"
  class:btn--disabled={disabled}
  {disabled}
  {onclick}
)
  @if(children)
    {@render children()}
  @elseif(label)
    {label}
</template>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: inherit;
    font-weight: 500;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn--sm { padding: 0.25rem 0.5rem; font-size: 0.875rem; }
  .btn--md { padding: 0.5rem 1rem; font-size: 1rem; }
  .btn--lg { padding: 0.625rem 1.25rem; font-size: 1.125rem; }

  .btn--primary { background-color: #ff3e00; color: white; }
  .btn--primary:hover:not(.btn--disabled) { background-color: #e03500; }

  .btn--secondary { background-color: #6c757d; color: white; }
  .btn--secondary:hover:not(.btn--disabled) { background-color: #5a6268; }

  .btn--danger { background-color: #ef4444; color: white; }
  .btn--danger:hover:not(.btn--disabled) { background-color: #dc2626; }

  .btn--disabled { opacity: 0.5; cursor: not-allowed; }
</style>
