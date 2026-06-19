# NMBL Project Rules

- Use **bun** as the package manager, but use node built-ins so this can run within node
- Use **vitest** for testing (not bun:test or jest)
- Use **bun catalogs** for common/shared dependency versions across the monorepo (define versions in root `package.json` under `"catalog"`, reference with `"catalog:"` in workspace packages)


- This repo uses turborepo, to cache builds and handle dependencies
  - in individual packages, you can run `bun run tbuild` to build the package and any dependencies
  - at the root you can run `bun run build:libs` to build everything except the website