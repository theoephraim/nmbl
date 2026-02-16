<template lang="nmbl">
header.site-header
  nav.container
    a.logo(href="/")
      span.logo-mark &gt;&lt;
      |  NMBL
    ul.nav-links
      li: a(href="/") Home
      li: a(href="/about") About
      li: a(href="/playground") Playground
</template>

<script setup lang="ts">
</script>

<style scoped>
.site-header {
  border-bottom: 1px solid var(--color-border);
  padding: 1rem 0;
}

.site-header nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  font-size: 1.25rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.logo-mark {
  font-size: 1.5rem;
  letter-spacing: -0.05em;
  line-height: 1;
}

.nav-links {
  display: flex;
  list-style: none;
  gap: 1.5rem;
}

.nav-links a {
  color: var(--color-text-muted);
  transition: color 0.2s;
}

.nav-links a:hover {
  color: var(--color-text);
}
</style>
