import { createSignal } from 'solid-js';
import { nmbl } from '@nmbl-lang/vite-plugin/tag';
import { Badge } from './components/Badge';

// A single component that exercises every NMBL feature, so the compiler
// output and the IDE (highlighting / intellisense) can be verified at a glance.
export default function FullExample() {
  const title = 'NMBL + Solid — Full Feature Tour';
  const [show, setShow] = createSignal(true);
  const [fruits] = createSignal(['Apple', 'Banana', 'Cherry']);

  // NOTE: this NMBL lives inside a JS template literal, so the embedded
  // markdown avoids backticks and ${...} (they would end the literal).
  return nmbl`
    section.full-example
      //! ── ${'vars'} via holes + a custom component ──────────────
      h1.fe-title
        | ${title}
        Badge(text="Solid" color="green")

      p.fe-sub There are ${fruits().length} fruits.

      //! ── embedded markdown (compiles to innerHTML) ───────────────
      div.fe-prose:md
        ## About this example

        This file exercises **every** NMBL feature: control flow, two loop
        styles, interpolation, embedded markdown, and a
        [custom component](https://nmbl.tools).

        - bold and _italic_ text
        - a [link](https://nmbl.tools)

      button.fe-toggle(onClick=${() => setShow((s) => !s)}) Toggle list

      //! ── idiomatic JSX loop: of-form @each compiles to a map ─────
      @if(${show()})
        div.fe-idiomatic
          h2 Idiomatic @each (of-form)
          ul.fe-list
            @each(fruit, i of ${fruits()} :key="fruit")
              li
                span.fe-num {i + 1}.
                span.fe-name {fruit}
                Badge(text={fruit} color="blue")
      @else
        p.fe-empty The list is hidden.

      //! ── non-idiomatic / portable: Svelte-style as-form ─────────
      div.fe-portable
        h2 Portable @each (as-form)
        ul.fe-list
          @each(${fruits()} as fruit, i (fruit))
            li
              span.fe-num {i + 1}.
              span.fe-name {fruit}
  `;
}
