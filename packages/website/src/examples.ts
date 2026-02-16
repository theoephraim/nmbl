import { decompile } from "@nmbl/parser";

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