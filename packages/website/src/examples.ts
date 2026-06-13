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

export const PLAYGROUND_EXAMPLE_NMBL = `
//! This comment is preserved in HTML output
// this comment is not :)

nav.main-nav
  ul
    li > a(href="/") Home
    li > a(href="/about") About
    li > a(href="/contact") Contact

section#hero.dark
  h1 Welcome to NMBL
  p A concise template language for HTML

article.prose:md
  ### Markdown sections

  Give any element a \`:md\` content block and write **markdown** —
  rendered at compile time through your project's markdown pipeline.

  - [links](/docs), *emphasis*, \`code\`
  - blank lines separate paragraphs

form(action="/subscribe" method="post")
  input(type="email" name="email" required)
  button(type="submit") Subscribe

SomeComponent(
  :prop // note about this prop
  // anotherProp="temporarily disabled via commenting!"
  another="foo"
)
`;