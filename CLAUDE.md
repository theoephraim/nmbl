# NMBL Project Rules

- Use **bun** as the package manager, but use node built-ins so this can run within node
- Use **vitest** for testing (not bun:test or jest)
- Use **bun catalogs** for common/shared dependency versions across the monorepo (define versions in root `package.json` under `"catalog"`, reference with `"catalog:"` in workspace packages)
