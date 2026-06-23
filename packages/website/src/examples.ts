import { compile } from "@nmbl-lang/core";
import { mdFilter } from "@nmbl-lang/core/markdown";

function nmblToHtml(nmbl: string): string {
  const { html } = compile(nmbl, { filters: { md: mdFilter } });
  return html.trimEnd();
}

// Compile to the `prompt` target (XML-tagged structured prompt), with markdown
// kept literal — used for the homepage prompt before→after.
function nmblToPrompt(nmbl: string): string {
  const { html } = compile(nmbl, { framework: "prompt", filters: { md: mdFilter } });
  return html.trimEnd();
}

/** Homepage prompt section: nmbl source and its compiled structured prompt. */
export const SHOWCASE_PROMPT = `// scratch notes — stripped, never sent to the model
system:md
  You are a precise assistant. Never invent facts.

task#summarize(priority="high")
  instructions:md
    Summarize the document in **3 bullets**, 20 words max.

  document#q3(source="q3-report.pdf")
    body:md
      # Q3 Report
      Revenue grew 20% to $4.1M.`;

export const SHOWCASE_PROMPT_OUTPUT = nmblToPrompt(SHOWCASE_PROMPT);

/** Homepage showcase: one basics example, then the two standout features. */
export const SHOWCASE_BASICS = `
nav#main-nav
  a.logo(href="/") Acme
  ul.links
    li > a(href="/features") Features
    li > a(href="/pricing") Pricing
`;

export const SHOWCASE_COMMENTS = `
// TODO: wire up auth    (this comment gets stripped)
//! Primary navigation   (the "!" makes it preserved)
button(
  type="submit"  // comment about an attribute
  // disabled    // or toggle using comments!
) Save
`;

export const SHOWCASE_MARKDOWN = `
article.prose:md
  ## Getting started

  Write **markdown** right in your markup —
  lists, \`code\`, and [links](/docs), all
  rendered at build time.
`;

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

export type PlaygroundFramework = 'html' | 'vue' | 'svelte' | 'astro' | 'react' | 'solid' | 'qwik' | 'prompt';

// One idiomatic example per framework — each exercises the same set of features
// so the playground shows them side by side: both comment tiers (// stripped,
// //! rendered) + commenting out an attribute, inline `:md` markdown, the host's
// native loops/conditionals, and `{ }` / `{{ }}` var interpolation. Swapped when
// you change the framework selector (unless you've edited).
export const PLAYGROUND_EXAMPLES: Record<PlaygroundFramework, string> = {
  html: `//! nmbl → plain HTML. No build step, no runtime.
// dev notes like this are stripped from the output
nav.main-nav
  ul
    li > a(href="/") Home
    li > a(href="/docs") Docs
    li > a(href="/about") About

article.prose:md
  ## Inline markdown

  Append \`:md\` to any element and write **markdown** —
  rendered at build time. Great for content-heavy pages.

  - [links](/docs), *emphasis*, and \`code\`

form(action="/subscribe" method="post")
  input(
    type="email"
    name="email"
    placeholder="you@example.com"
    // disabled        ← toggle a prop without deleting it
    required
  )
  button(type="submit") Subscribe`,

  vue: `//! Vue SFC template. {{ }} interpolation; v-for / v-if pass through.
section.todos
  h1 {{ title }}

  ul
    li(v-for="todo in todos" :key="todo.id" :class="{ done: todo.done }")
      input(
        type="checkbox"
        v-model="todo.done"
        // @change="persist"   ← comment a prop out while debugging
      )
      span.label {{ todo.text }}

  p.empty(v-if="!todos.length") Nothing to do 🎉

  // @if / @each are optional sugar — they compile to <template v-if/v-for>
  @if(showCompleted)
    @each(todo of done :key="todo.id")
      del.done {{ todo.text }}

  //! markdown blocks render at build time
  article.note:md
    **Tip:** write **markdown** inline with \`:md\`.`,

  svelte: `//! Svelte template. {expr} interpolation; @if / @each → {#if} / {#each}.
section.todos
  h1 {title}

  @if(todos.length)
    ul
      @each(todo of todos :key="todo.id")
        li(class:done={todo.done})
          input(
            type="checkbox"
            bind:checked={todo.done}
            // on:change={persist}   ← toggle a prop without deleting it
          )
          span.label {todo.text}
  @else
    p.empty Nothing to do 🎉

  // a quick dev note — stripped from output
  //! markdown blocks render at build time
  article.note:md
    **Tip:** write **markdown** inline with \`:md\`.

  button(on:click={addTodo}) Add todo`,

  astro: `//! Astro component. {expr}; @each → .map(); @if → conditional.
section.posts
  h1 {title}

  @if(posts.length)
    @each(post of posts :key="post.slug")
      article.card
        h2 {post.title}
        p.excerpt {post.excerpt}
        a(
          href={\`/blog/\${post.slug}\`}
          // data-prefetch   ← comment a prop out while iterating
        ) Read more →
  @else
    p.empty No posts yet.

  // islands hydrate on the client
  //! markdown blocks render at build time
  article.note:md
    **Tip:** write **markdown** inline with \`:md\`.

  Counter(client:visible initialCount={0})`,

  react: `//! React — nmbl\`…\` tagged template compiles to JSX. {expr} interpolation.
section.todos
  h1 {title}

  @if(todos.length)
    ul
      @each(todo of todos :key="todo.id")
        li.item(onClick={() => toggle(todo.id)})
          input(
            type="checkbox"
            checked={todo.done}
            // onChange={persist}   ← comment a prop out while debugging
          )
          span.label {todo.text}
  @else
    p.empty Nothing to do 🎉

  // class → className is applied automatically for React
  article.prose:md
    **Tip:** write **markdown** inline with \`:md\`.

  Button(variant="primary" onClick={addTodo}) Add todo`,

  solid: `//! Solid — nmbl\`…\` tagged template compiles to JSX. Signals like {count()}.
section.todos
  h1 {title()}

  @if(todos().length)
    ul
      @each(todo of todos() :key="todo.id")
        li.item(onClick={() => toggle(todo.id)})
          input(
            type="checkbox"
            checked={todo.done}
            // onChange={persist}   ← comment a prop out inline
          )
          span.label {todo.text}
  @else
    p.empty Nothing to do 🎉

  // class stays class — Solid has no className rename
  article.prose:md
    **Tip:** write **markdown** inline with \`:md\` (Solid → innerHTML).

  Button(variant="primary" onClick={addTodo}) Add todo`,

  qwik: `//! Qwik — nmbl\`…\` tagged template compiles to JSX. Signals like {count.value}.
section.todos
  h1 {title}

  @if(todos.length)
    ul
      @each(todo of todos :key="todo.id")
        li.item(onClick$={() => toggle(todo.id)})
          input(
            type="checkbox"
            checked={todo.done}
            // onChange$={persist}   ← comment a prop out inline
          )
          span.label {todo.text}
  @else
    p.empty Nothing to do 🎉

  // class stays class — Qwik uses standard HTML attribute names
  article.prose:md
    **Tip:** write **markdown** inline with \`:md\`.

  Button(variant="primary" onClick$={addTodo}) Add todo`,

  prompt: `// dev notes like this are stripped — they never reach the model
//! this one ships as a comment in the rendered prompt
system:md
  You are a precise assistant. You never invent facts.

task(id="summarize" priority="high")
  instructions:md
    Summarize the document in **3 bullet points**.
    Keep each under 20 words.

  document(
    source="report.pdf"
    // format="markdown"   ← comment an attribute out
  )
    body:md
      # Q3 Report
      Revenue grew 20% to $4.1M.
      - EMEA lagged on enterprise deals

  output_format:md
    Return a markdown bulleted list. No preamble.`,
};

export type IntegrationFramework = 'vue' | 'svelte' | 'astro' | 'react' | 'solid' | 'qwik';

// "Drops into your framework" homepage toggle: the SAME nmbl markup shown inside
// each host's integration wrapper — `<template lang="nmbl">` for Vue/Svelte/Astro,
// the `nmbl`…`` tagged template for the JSX frameworks. The point is that only the
// host boilerplate changes; the markup is identical, and it all compiles away at
// build time.
export const FRAMEWORK_INTEGRATIONS: Record<IntegrationFramework, string> = {
  vue: `<script setup lang="ts">
const steps = ['Edit', 'Run', 'Ship']
</script>

<template lang="nmbl">
main#app
  h1 Hello from nmbl
  ul.steps
    li(v-for="step in steps" :key="step") {{ step }}
</template>`,

  svelte: `<script lang="ts">
  let steps = ['Edit', 'Run', 'Ship'];
</script>

<template lang="nmbl">
main#app
  h1 Hello from nmbl
  ul.steps
    @each(step of steps)
      li {step}
</template>`,

  astro: `---
const steps = ['Edit', 'Run', 'Ship'];
---

<template lang="nmbl">
main#app
  h1 Hello from nmbl
  ul.steps
    @each(step of steps)
      li {step}
</template>`,

  react: `import { nmbl } from '@nmbl-lang/vite-plugin/tag';

export function App() {
  const steps = ['Edit', 'Run', 'Ship'];
  return nmbl\`
    main#app
      h1 Hello from nmbl
      ul.steps
        @each(step of steps)
          li {step}
  \`;
}`,

  solid: `import { nmbl } from '@nmbl-lang/vite-plugin/tag';
import { createSignal } from 'solid-js';

export function App() {
  const [steps] = createSignal(['Edit', 'Run', 'Ship']);
  return nmbl\`
    main#app
      h1 Hello from nmbl
      ul.steps
        @each(step of steps())
          li {step}
  \`;
}`,

  qwik: `import { component$, useSignal } from '@builder.io/qwik';
import { nmbl } from '@nmbl-lang/vite-plugin/tag';

export const App = component$(() => {
  const steps = useSignal(['Edit', 'Run', 'Ship']);
  return nmbl\`
    main#app
      h1 Hello from nmbl
      ul.steps
        @each(step of steps.value)
          li {step}
  \`;
});`,
};