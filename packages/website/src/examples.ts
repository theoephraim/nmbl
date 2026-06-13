import { compile, decompile } from "@nmbl-lang/core";

function nmblToHtml(nmbl: string): string {
  const { html } = compile(nmbl);
  return html.trimEnd();
}

export const HOMEPAGE_EXAMPLE_HTML = `
<div id="app">
  <header class="site-header">
    <div class="container">
      <a class="logo" href="/">Acme</a>
      <nav>
        <a href="/features">Features</a>
        <a href="/pricing">Pricing</a>
        <a class="btn btn-primary" href="/signup">Get Started</a>
      </nav>
    </div>
  </header>
  <main>
    <div class="hero">
      <div class="container">
        <h1>Ship faster with less code</h1>
        <p class="lead">Stop writing closing tags.</p>
        <div class="actions">
          <a class="btn btn-primary" href="/signup">Start Free</a>
          <a class="btn btn-ghost" href="/demo">Watch Demo</a>
        </div>
      </div>
    </div>
    <div class="features">
      <div class="container">
        <h2>Why teams switch</h2>
        <div class="grid">
          <div class="card">
            <h3>Fast</h3>
            <p>Zero runtime. Compiles in microseconds.</p>
          </div>
          <div class="card">
            <h3>Simple</h3>
            <p>Know CSS selectors? You know NMBL.</p>
          </div>
          <div class="card">
            <h3>AI-native</h3>
            <p>Fewer tokens. Faster generation.</p>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>`;
export const HOMEPAGE_EXAMPLE_NMBL = decompile(HOMEPAGE_EXAMPLE_HTML);

export const FEATURE_EMBEDDED_MD = `article:md
  ## My Post
  This is *markdown*, handed to
  your md filter at build time.`;

export const COMMENT_VISIBILITY = `nav
  // TODO: add auth links
  //! Navigation links
  ul
    li > a(href="/") Home
    li > a(href="/about") About`;
export const COMMENT_VISIBILITY_HTML = nmblToHtml(COMMENT_VISIBILITY);

export const COMMENT_ATTR = `button(
  type="submit"
  // disabled
  class="btn"
  /* aria-label="Save" */
) Save`;
export const COMMENT_ATTR_HTML = nmblToHtml(COMMENT_ATTR);

export const CONTROL_FLOW = `@if(loggedIn)
  p Welcome back, {user.name}!
  a(href="/dashboard") Dashboard
@else
  p Please log in

@each(item of items :key="item.id")
  li
    span.name {item.name}
    span.price {item.price}`;
export const CONTROL_FLOW_HTML = (() => {
  const { html } = compile(CONTROL_FLOW, { framework: 'svelte' });
  return html.trimEnd();
})();

export const CONTROL_FLOW_VUE = `@if(loggedIn)
  p Welcome back, {{ user.name }}!
  a(href="/dashboard") Dashboard
@else
  p Please log in

@each(item of items :key="item.id")
  li
    span.name {{ item.name }}
    span.price {{ item.price }}`;
export const CONTROL_FLOW_VUE_HTML = (() => {
  const { html } = compile(CONTROL_FLOW_VUE, { framework: 'vue' });
  return html.trimEnd();
})();

export type PlaygroundFramework = 'html' | 'vue' | 'svelte' | 'astro';

// One idiomatic example per framework — each shows that host's interpolation
// and how NMBL's control flow compiles to its native syntax. Swapped in the
// playground when you change the framework selector (unless you've edited).
export const PLAYGROUND_EXAMPLES: Record<PlaygroundFramework, string> = {
  html: `//! Plain HTML — structure, selectors, and inline markdown.
nav.main-nav
  ul
    li > a(href="/") Home
    li > a(href="/about") About

article.prose:md
  ### Inline markdown

  Append \`:md\` to any element and write **markdown** —
  rendered at build time. Great for content-heavy pages.

  - [links](/docs), *emphasis*, \`code\`

form(action="/subscribe" method="post")
  input(
    type="email"
    name="email"
    // placeholder="you@example.com"   ← comment a prop out while iterating
    required
  )
  button(type="submit") Subscribe`,

  vue: `//! Vue — native v-if / v-for pass straight through.
section.todos
  h1 {{ title }}

  ul
    li(v-for="todo in todos" :key="todo.id" :class="{ done: todo.done }")
      input(
        type="checkbox"
        v-model="todo.done"
        // @change="save"   ← comment a prop out, no syntax juggling
      )
      span.label {{ todo.text }}

  p.empty(v-if="!todos.length") Nothing to do 🎉

  article.note:md
    **Tip:** write markdown inline with \`:md\` — rendered at build time.

  // @if is optional sugar — it compiles to <template v-if>
  @if(showStats)
    TodoStats(:count="todos.length")`,

  svelte: `//! Svelte — {expr}; @if / @each compile to {#if} / {#each}.
section.todos
  h1 {title}

  @if(todos.length)
    ul
      @each(todo of todos :key="todo.id")
        li(class:done={todo.done})
          input(
            type="checkbox"
            bind:checked={todo.done}
            // on:change={save}   ← comment a prop out inline
          )
          span.label {todo.text}
  @else
    p.empty Nothing to do 🎉

  article.note:md
    **Tip:** write markdown inline with \`:md\` — rendered at build time.

  button(on:click={addTodo}) Add todo`,

  astro: `//! Astro — {expr}; @each → .map(); client: directives hydrate islands.
section.posts
  h1 {title}

  @each(post of posts :key="post.slug")
    article.card
      h2 {post.title}
      a(
        href={\`/blog/\${post.slug}\`}
        // data-prefetch   ← comment a prop out while iterating
      ) Read more →

  article.note:md
    **Tip:** write markdown inline with \`:md\` — rendered at build time.

  Counter(client:visible initialCount={0})`,
};