# Vue Language Plugin for NMBL

This package provides Vue language server support for NMBL templates, enabling intellisense, error reporting, and other IDE features in `.vue` files using NMBL syntax.

## Installation

```bash
npm install @nmbl/vue-language-plugin
```

## Usage

Configure in your `tsconfig.json`:

```json
{
  "vueCompilerOptions": {
    "plugins": ["@nmbl/vue-language-plugin"]
  }
}
```

Then use NMBL in your Vue SFCs:

```vue
<template lang="nmbl">
div#app
  h1.title {{ message }}
  button(@click="handleClick") Click me
</template>
```

## How It Works

### Architecture

The plugin implements the Vue Language Core plugin interface to transform NMBL templates into HTML that Vue's compiler can understand. It consists of three main parts:

1. **Template Compilation** (`compileSFCTemplate`)
   - Compiles NMBL syntax to HTML using the `@nmbl/parser` compiler
   - Preserves Vue directives, interpolations, and event handlers
   - Returns an AST that Vue's compiler can process

2. **Source Mappings**
   - Maintains precise character-level mappings between NMBL source and generated HTML
   - Enables accurate error reporting, go-to-definition, and intellisense
   - Uses Volar's `SourceMap` and `muggle-string` segment format

3. **Embedded Code Resolution**
   - Tells Volar how to handle NMBL template blocks
   - Currently reports `lang: 'pug'` as a workaround for component auto-imports

### Source Mapping Implementation

The plugin creates bidirectional mappings between NMBL source positions and HTML output positions:

```typescript
// NMBL source
div.container#main
  button(@click="test")

// Generated HTML with mappings
<div class="container" id="main">
  <button @click="test"></button>
</div>
```

Each mapping contains:
- `sourceSpan`: Position in original NMBL code
- `generatedSpan`: Position in generated HTML
- `metadata`: Context like attribute names or node types

#### Key Mapping Features

1. **CSS Shorthand Mappings**
   - Classes (`.container`) map with the dot prefix included
   - IDs (`#main`) map with the hash prefix included
   - This alignment ensures correct offset calculations in Volar

2. **Attribute Mappings**
   - Both attribute names and values are mapped separately
   - Values include the opening quote to match Vue's AST expectations
   - Multi-line attributes handled with special quote-finding logic

3. **Offset Resolution**
   - When Volar queries an unmapped HTML position, we scan backward/forward
   - Find the nearest mapped position to avoid linear extrapolation errors
   - Prevents incorrect offsets when HTML syntax is much longer than NMBL

### Component Auto-Import Workaround

Vue's language server detects component usage patterns to provide auto-import suggestions. It has built-in recognition for:
- HTML: `<MyComponent` patterns
- Pug: `MyComponent(` patterns

NMBL uses the same `ComponentName(` syntax as Pug, but Volar doesn't recognize NMBL as a known template language. To enable auto-imports, we currently report NMBL templates as `lang: 'pug'`:

```typescript
getEmbeddedCodes(_fileName, sfc) {
  if (sfc.template?.lang === 'nmbl') {
    return [{
      id: 'template',
      lang: 'pug',  // Leverage Volar's built-in Pug pattern detection
    }];
  }
}
```

This workaround enables component auto-import suggestions without affecting other functionality since:
- The actual compilation still uses NMBL's compiler
- Source mappings remain accurate
- No Pug syntax is involved in the actual parsing

### CSS Class Linking

CSS classes in NMBL templates are automatically linked to their definitions in `<style>` blocks, but only when the style block uses `scoped` attribute:

```vue
<template lang="nmbl">
div.my-class

<style scoped>
.my-class { /* This will be linked */ }
</style>
```

This is a Vue/Volar limitation that applies to all template languages, not specific to NMBL.

## Development

### Building

```bash
bun run build
```

### Testing

The plugin is tested through the parser's Vue integration tests:

```bash
cd ../parser
bun test vue-integration
```

### Key Files

- `src/index.ts` - Main plugin implementation
- `dist/index.cjs` - CommonJS build for Vue language server
- `dist/index.mjs` - ESM build

## Known Limitations

1. **Component Auto-Imports**: Currently requires reporting as `lang: 'pug'` for pattern detection
2. **CSS Linking**: Only works with `scoped` styles (Vue/Volar limitation)
3. **Source Maps**: Some complex nested structures may have approximate positions

## Future Improvements

- Native NMBL pattern recognition in Volar (requires upstream changes)
- More efficient source mapping for large templates
- Support for NMBL-specific language features in IDE