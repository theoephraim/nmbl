<template lang="nmbl">
header.site-header
  nav.container
    a.logo(href="/")
      <svg class="logo-mark" viewBox="0 3 24 18" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="2.6" height="18" rx="1.3" fill="var(--rainbow-0)"/>
      <rect x="6.35" y="5.5" width="2.6" height="15.5" rx="1.3" fill="var(--rainbow-1)"/>
      <rect x="10.7" y="8" width="2.6" height="13" rx="1.3" fill="var(--rainbow-2)"/>
      <rect x="15.05" y="10.5" width="2.6" height="10.5" rx="1.3" fill="var(--rainbow-3)"/>
      <rect x="19.4" y="13" width="2.6" height="8" rx="1.3" fill="var(--rainbow-4)"/>
      </svg>
      |  nmbl
    ul.nav-links
      li > a(href="/") Home
      li > a(href="/guides/syntax") Syntax
      li > a(href="/guides") Guides
      li > a(href="/playground") Playground
      li > a(href="/about") About
      li
        a.nav-github(href="https://github.com/theoephraim/nmbl" target="_blank" rel="noopener" aria-label="nmbl on GitHub")
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12 24 5.73 18.77.5 12.5.5z"/>
          </svg>
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
  /* baseline-align so the mark's bottom sits on the wordmark's baseline; the
     mark is taller than the text and rises above it, but stays anchored to the
     baseline like a letter. */
  align-items: baseline;
  gap: 0.4rem;
}

.logo-mark {
  display: block;
  flex-shrink: 0;
  height: 1.15em;
  width: auto;
}

.nav-links {
  display: flex;
  align-items: center;
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

.nav-github {
  display: flex;
  align-items: center;
}
</style>
