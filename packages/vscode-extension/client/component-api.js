"use strict";
/**
 * component-api.ts
 *
 * Best-effort extraction of a component's prop and emit names from its source,
 * for prop/emit completion inside `<template lang="nmbl">`. Prop names are
 * type-derived and there's no Vue template service on the nmbl region to supply
 * them, so we parse the component's `defineProps`/`defineEmits` ourselves.
 *
 * Coverage is the common authoring shapes: `defineProps<{…}>()`,
 * `defineProps<Props>()` with a local `interface Props`/`type Props`,
 * `defineProps({…})`, `withDefaults(defineProps…)`, and the matching
 * `defineEmits` forms. NOT covered: prop/emit types imported from another file
 * or built by generics — those simply yield nothing (graceful: no suggestions).
 *
 * All functions here are pure (string in, names out) so they can be unit-tested
 * without a VS Code host or filesystem.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractImportSource = extractImportSource;
exports.extractComponentApi = extractComponentApi;
exports.extractMemberKeys = extractMemberKeys;
exports.extractStringLiterals = extractStringLiterals;
/**
 * Find the module specifier a component is imported from in a `<script>` block,
 * e.g. `import VButton from './VButton.vue'` → `./VButton.vue`. Handles default
 * and named imports. Returns null if not found.
 */
function extractImportSource(scriptText, componentName) {
    const name = escapeRegExp(componentName);
    // import Name from '...'   |   import { ... Name ... } from '...'
    const re = new RegExp(`import\\s+(?:${name}\\b|(?:[^'";]*\\{[^}]*\\b${name}\\b[^}]*\\}))[^'";]*from\\s*(['"])([^'"]+)\\1`);
    const m = re.exec(scriptText);
    return m ? m[2] : null;
}
/** Extract prop and emit names from a component's full source text. */
function extractComponentApi(source) {
    return {
        props: extractMacro(source, 'defineProps'),
        emits: extractMacro(source, 'defineEmits'),
    };
}
/**
 * Pull the member names out of a `defineProps`/`defineEmits` call, across its
 * forms: `<{…}>` (type literal), `<Name>` (resolve a local interface/type),
 * `({…})` (runtime object), and `([...])` (runtime array of event names).
 */
function extractMacro(source, macro) {
    const call = source.indexOf(macro);
    if (call === -1)
        return [];
    // Scan forward from the macro name to its `<` (generic) or `(` (runtime).
    let i = call + macro.length;
    while (i < source.length && /\s/.test(source[i]))
        i++;
    if (source[i] === '<') {
        let j = i + 1;
        while (j < source.length && /\s/.test(source[j]))
            j++;
        if (source[j] === '{') {
            // Inline type literal: defineProps<{ … }>()
            const body = balancedBody(source, j);
            return body ? extractMemberKeys(body) : [];
        }
        // Named type: defineProps<Props>() → resolve a local interface/type.
        const nameMatch = /^([A-Za-z_$][\w$]*)/.exec(source.slice(j));
        if (nameMatch)
            return resolveLocalType(source, nameMatch[1]);
        return [];
    }
    if (source[i] === '(') {
        let j = i + 1;
        while (j < source.length && /\s/.test(source[j]))
            j++;
        if (source[j] === '{') {
            const body = balancedBody(source, j);
            return body ? extractMemberKeys(body) : [];
        }
        if (source[j] === '[') {
            const body = balancedBody(source, j, '[', ']');
            return body ? extractStringLiterals(body) : [];
        }
    }
    return [];
}
/** Resolve a locally-declared `interface Name {…}` or `type Name = {…}`. */
function resolveLocalType(source, name) {
    const n = escapeRegExp(name);
    const iface = new RegExp(`interface\\s+${n}\\b[^{]*\\{`).exec(source);
    if (iface) {
        const braceIdx = iface.index + iface[0].length - 1;
        const body = balancedBody(source, braceIdx);
        if (body)
            return extractMemberKeys(body);
    }
    const alias = new RegExp(`type\\s+${n}\\b[^=]*=\\s*\\{`).exec(source);
    if (alias) {
        const braceIdx = alias.index + alias[0].length - 1;
        const body = balancedBody(source, braceIdx);
        if (body)
            return extractMemberKeys(body);
    }
    return [];
}
/**
 * Given the index of an opening bracket, return the text between it and its
 * matching close (depth-aware, skipping string/template contents). Null if
 * unbalanced.
 */
function balancedBody(s, open, openCh = '{', closeCh = '}') {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        const c = s[i];
        if (c === '"' || c === "'" || c === '`') {
            i = skipString(s, i);
            continue;
        }
        if (c === openCh)
            depth++;
        else if (c === closeCh) {
            depth--;
            if (depth === 0)
                return s.slice(open + 1, i);
        }
    }
    return null;
}
/**
 * Top-level member names in a type-literal / object body: an identifier at
 * bracket-depth 0 immediately followed by an optional `?` and a `:`.
 */
function extractMemberKeys(body) {
    const keys = [];
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (c === '"' || c === "'" || c === '`') {
            i = skipString(body, i);
            continue;
        }
        if (c === '{' || c === '(' || c === '[' || c === '<') {
            depth++;
            continue;
        }
        if (c === '}' || c === ')' || c === ']' || c === '>') {
            depth--;
            continue;
        }
        if (depth === 0 && /[A-Za-z_$]/.test(c)) {
            let j = i;
            while (j < body.length && /[\w$]/.test(body[j]))
                j++;
            const id = body.slice(i, j);
            let k = j;
            while (k < body.length && /\s/.test(body[k]))
                k++;
            if (body[k] === '?') {
                k++;
                while (k < body.length && /\s/.test(body[k]))
                    k++;
            }
            if (body[k] === ':')
                keys.push(id);
            i = j - 1;
        }
    }
    return [...new Set(keys)];
}
/** Extract string-literal entries from a runtime array body, e.g. `['a', 'b']`. */
function extractStringLiterals(body) {
    const out = [];
    const re = /['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(body)))
        out.push(m[1]);
    return [...new Set(out)];
}
/** Advance past a string/template literal that starts at `i`; returns the index of its closing quote. */
function skipString(s, i) {
    const quote = s[i];
    for (let j = i + 1; j < s.length; j++) {
        if (s[j] === '\\') {
            j++;
            continue;
        }
        if (s[j] === quote)
            return j;
    }
    return s.length;
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
