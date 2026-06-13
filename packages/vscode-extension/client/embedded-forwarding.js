"use strict";
/**
 * embedded-forwarding.ts
 *
 * Provides completion, definition, and hover forwarding for component names
 * inside `<template lang="nmbl">` regions of .svelte, .astro, and .vue files.
 *
 * Strategy: detect the nmbl template region, then proxy the VS Code provider
 * commands at an equivalent position inside the document's script/frontmatter
 * block so the host framework's language server (Svelte/Astro/Vue TS service)
 * answers on its own turf. Component completions (PascalCase) are plucked from
 * that response and re-targeted at the template region word range — including
 * the auto-import edits, which land in the script block of the same document.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VUE_DIRECTIVES = void 0;
exports.findNmblRegion = findNmblRegion;
exports.isOffsetInNmblRegion = isOffsetInNmblRegion;
exports.isTagNamePosition = isTagNamePosition;
exports.isPascalCase = isPascalCase;
exports.getItemLabel = getItemLabel;
exports.isComponentCandidate = isComponentCandidate;
exports.findScriptAnchorOffset = findScriptAnchorOffset;
exports.findLastNonBlankLineOffset = findLastNonBlankLineOffset;
exports.htmlTagNames = htmlTagNames;
exports.buildHtmlTagItems = buildHtmlTagItems;
exports.attributeContext = attributeContext;
exports.buildAttributeItems = buildAttributeItems;
exports.nmblRegionAt = nmblRegionAt;
exports.scriptAnchorPosition = scriptAnchorPosition;
exports.mapToTemplateItem = mapToTemplateItem;
exports.registerEmbeddedForwarding = registerEmbeddedForwarding;
const vscode = __importStar(require("vscode"));
const vscode_html_languageservice_1 = require("vscode-html-languageservice");
const TEMPLATE_RE = /<template[^>]*\blang=(["'])nmbl\1[^>]*>([\s\S]*?)<\/template>/;
/**
 * Find the `<template lang="nmbl">` body region in a raw document string.
 * Returns the character offsets {start, end} of the body (exclusive of the tags).
 */
function findNmblRegion(text) {
    const m = TEMPLATE_RE.exec(text);
    if (!m)
        return undefined;
    const openTagEnd = m[0].indexOf('>') + 1;
    const start = m.index + openTagEnd;
    const end = start + m[2].length;
    return { start, end };
}
/**
 * Check whether the given zero-based character offset falls within the nmbl
 * template region.
 */
function isOffsetInNmblRegion(text, offset) {
    const region = findNmblRegion(text);
    if (!region)
        return undefined;
    if (offset >= region.start && offset <= region.end)
        return region;
    return undefined;
}
// ---------------------------------------------------------------------------
// Tag-name position detection (pure — operates on strings and offsets)
// ---------------------------------------------------------------------------
/**
 * Decide whether the cursor at `offset` is in a position where a component
 * tag-name is being typed.  Returns true when the text between the last
 * newline and `offset` (before the current word) is either:
 *   - only whitespace ("  <Foo…" or "  Foo…"), or
 *   - ends with ">" possibly followed by whitespace (block expansion "Foo> Bar…")
 *
 * Also returns true when offset is right after a "<" character.
 *
 * @param linePrefix  The text from the start of the line up to (but NOT
 *                    including) the current word.
 */
function isTagNamePosition(linePrefix) {
    // Right after an opening angle bracket, e.g. `<Foo`
    if (linePrefix.endsWith('<'))
        return true;
    // Line has only whitespace before the word
    if (/^\s*$/.test(linePrefix))
        return true;
    // Line ends with `> ` (block expansion context, e.g. `SomeTag> Foo`)
    if (/>\s*$/.test(linePrefix))
        return true;
    return false;
}
// ---------------------------------------------------------------------------
// PascalCase / component detection (pure)
// ---------------------------------------------------------------------------
const PASCAL_RE = /^[A-Z][A-Za-z0-9_]*$/;
/** Return true if the string looks like a PascalCase component name. */
function isPascalCase(s) {
    return PASCAL_RE.test(s);
}
/** Extract the string label from a CompletionItem label (string | CompletionItemLabel). */
function getItemLabel(label) {
    if (typeof label === 'string')
        return label;
    return label.label;
}
/**
 * Decide whether a CompletionItem should be kept as a component suggestion.
 *
 * Keeps items that:
 *  - have a PascalCase label, AND
 *  - (a) have a preferred kind (Class / Variable / Function / Module / Reference), OR
 *  - (b) appear to be an auto-import candidate (labelDetails?.description or
 *        detail mentions a module/file path)
 */
function isComponentCandidate(item) {
    const label = getItemLabel(item.label);
    if (!isPascalCase(label))
        return false;
    const preferredKinds = new Set([
        vscode.CompletionItemKind.Class,
        vscode.CompletionItemKind.Variable,
        vscode.CompletionItemKind.Function,
        vscode.CompletionItemKind.Module,
        vscode.CompletionItemKind.Reference,
        vscode.CompletionItemKind.Value,
        vscode.CompletionItemKind.Constant,
    ]);
    if (item.kind !== undefined && preferredKinds.has(item.kind))
        return true;
    // Auto-import candidate: description embedded in the CompletionItemLabel object
    // or detail looks like a file/module path.
    const labelObj = typeof item.label === 'object' ? item.label : null;
    const desc = labelObj?.description ?? '';
    const detail = item.detail ?? '';
    const looksLikePath = /['"`]|\/|\.(svelte|astro|vue|ts|tsx|js|jsx)/.test(desc + detail);
    if (looksLikePath)
        return true;
    return false;
}
// ---------------------------------------------------------------------------
// Script-anchor position finder
// ---------------------------------------------------------------------------
/**
 * Find a Position inside the script or frontmatter block of a document.
 *
 * For .svelte: looks for `<script…>…</script>` and returns a position on the
 *   last non-blank line before `</script>`.
 * For .astro: looks for the leading `---…---` frontmatter block and returns a
 *   position on the last non-blank line before the closing `---`.
 *
 * Returns undefined if no such block exists.
 */
function findScriptAnchorOffset(text, languageId) {
    if (languageId === 'astro') {
        // Frontmatter: leading ---\n…\n---
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
        if (!fm)
            return undefined;
        const blockEnd = fm.index + fm[0].lastIndexOf('\n---');
        // Find the last non-blank line before the closing fence
        const body = text.substring(fm.index + 4, fm.index + blockEnd - 1);
        // We want a position just before the closing ---
        // Return offset just before closing ---
        const closingFenceOffset = fm.index + fm[0].lastIndexOf('\n---') + 1;
        // Find last non-blank line before closingFenceOffset
        const bodyText = text.substring(0, closingFenceOffset);
        const lastNonBlankLine = findLastNonBlankLineOffset(bodyText, fm.index + 4);
        return lastNonBlankLine;
    }
    else {
        // svelte (or generic): look for <script ...>...</script>
        const scriptMatch = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(text);
        if (!scriptMatch)
            return undefined;
        const scriptTagEnd = scriptMatch.index + scriptMatch[0].indexOf('>') + 1;
        const scriptBodyStart = scriptTagEnd;
        const scriptBodyEnd = scriptMatch.index + scriptMatch[0].lastIndexOf('</script>');
        // Find last non-blank line in the script body
        const lastOffset = findLastNonBlankLineOffset(text.substring(0, scriptBodyEnd), scriptBodyStart);
        return lastOffset;
    }
}
/**
 * Find the offset of the start of the last non-blank line in `text`
 * that is at or after `fromOffset`.  If none, returns `fromOffset` itself.
 */
function findLastNonBlankLineOffset(text, fromOffset) {
    // Split the portion we care about into lines and find the last non-blank
    const relevant = text.substring(fromOffset);
    const lines = relevant.split('\n');
    let runningOffset = fromOffset;
    let lastNonBlankOffset = fromOffset;
    for (const line of lines) {
        if (line.trim() !== '') {
            lastNonBlankOffset = runningOffset;
        }
        runningOffset += line.length + 1;
    }
    return lastNonBlankOffset;
}
// ---------------------------------------------------------------------------
// HTML tag completions
// ---------------------------------------------------------------------------
// HTML element data sourced from `vscode-html-languageservice` — the same
// upstream-maintained dataset VS Code's own HTML support uses, so we don't hand-
// maintain a tag list. These aren't TS symbols, so they don't come from the
// script-anchor proxy; we provide them directly. Computed once and cached.
let cachedHtmlTags;
function htmlTagData() {
    return (cachedHtmlTags ?? (cachedHtmlTags = (0, vscode_html_languageservice_1.getDefaultHTMLDataProvider)().provideTags()));
}
/** The standard HTML element names (exported for tests). */
function htmlTagNames() {
    return htmlTagData().map(t => t.name);
}
/** Build CompletionItems for the standard HTML tags, targeted at `wordRange`. */
function buildHtmlTagItems(wordRange) {
    return htmlTagData().map(tag => {
        const item = new vscode.CompletionItem(tag.name, vscode.CompletionItemKind.Property);
        item.detail = '(html element)';
        const desc = typeof tag.description === 'string' ? tag.description : tag.description?.value;
        if (desc)
            item.documentation = desc;
        item.insertText = tag.name;
        item.range = wordRange;
        item.filterText = tag.name;
        // Sort after components (components use 0_/1_ prefixes).
        item.sortText = `2_${tag.name}`;
        return item;
    });
}
// ---------------------------------------------------------------------------
// Attribute / directive / event completions
// ---------------------------------------------------------------------------
/** Vue's built-in directives — not in the HTML dataset, so listed here. */
exports.VUE_DIRECTIVES = [
    'v-if', 'v-else-if', 'v-else', 'v-for', 'v-bind', 'v-on', 'v-model', 'v-show',
    'v-html', 'v-text', 'v-slot', 'v-pre', 'v-once', 'v-memo', 'v-cloak',
];
function htmlAttributeData(tag) {
    try {
        return (0, vscode_html_languageservice_1.getDefaultHTMLDataProvider)().provideAttributes(tag);
    }
    catch {
        return [];
    }
}
/**
 * Classify the cursor's context by scanning template text up to it, so we can
 * tell an attribute-name position (inside a tag's `(...)`) apart from
 * expressions — `@if(...)` control flow, `{{ }}` interpolations, `{…}` brace
 * values, and quoted attribute values — which already get TS completion.
 * Returns the enclosing tag name when in an attribute position.
 */
function attributeContext(before) {
    let inStr = null;
    let interp = 0;
    const stack = [];
    for (let i = 0; i < before.length; i++) {
        const c = before[i];
        const next = before[i + 1];
        if (inStr) {
            if (c === inStr && before[i - 1] !== '\\')
                inStr = null;
            continue;
        }
        if (interp > 0) {
            if (c === '}' && next === '}') {
                interp--;
                i++;
            }
            continue;
        }
        if (c === '{' && next === '{') {
            interp++;
            i++;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            inStr = c;
            continue;
        }
        if (c === '{') {
            stack.push({ kind: 'brace', tag: null });
            continue;
        }
        if (c === '}') {
            if (stack[stack.length - 1]?.kind === 'brace')
                stack.pop();
            continue;
        }
        if (c === '(') {
            // The token immediately before '(' (no whitespace between) — a tag name,
            // `.class`/`#id` shorthand (implicit div), or an `@if`/`@each` keyword.
            let j = i - 1;
            while (j >= 0 && /[\w@.\-#]/.test(before[j]))
                j--;
            const token = before.slice(j + 1, i);
            if (/^@(if|elseif|else|each)$/.test(token)) {
                stack.push({ kind: 'control', tag: null });
            }
            else if (token && /[A-Za-z.#]/.test(token[0])) {
                const m = token.match(/^[A-Za-z][\w-]*/);
                stack.push({ kind: 'attr', tag: m ? m[0] : 'div' });
            }
            else {
                stack.push({ kind: 'group', tag: null });
            }
            continue;
        }
        if (c === ')') {
            if (stack.length)
                stack.pop();
            continue;
        }
    }
    if (inStr || interp > 0)
        return { inAttr: false, tag: null };
    const top = stack[stack.length - 1];
    return top?.kind === 'attr' ? { inAttr: true, tag: top.tag } : { inAttr: false, tag: null };
}
/**
 * Completions for an attribute-name position: Vue directives, plus the element's
 * HTML attributes and events (an `on*` attribute becomes a Vue `@event`). Both
 * plain (`disabled`) and bound (`:disabled`) forms are offered. Component-
 * specific props/emits are NOT included — those are type-derived and would need
 * deeper Vue integration.
 */
function buildAttributeItems(wordRange, tag) {
    const items = [];
    const add = (label, kind, detail, sort) => {
        const item = new vscode.CompletionItem(label, kind);
        item.insertText = label;
        item.range = wordRange;
        item.filterText = label;
        item.detail = detail;
        item.sortText = sort;
        items.push(item);
    };
    for (const d of exports.VUE_DIRECTIVES)
        add(d, vscode.CompletionItemKind.Keyword, '(vue directive)', `0_${d}`);
    for (const a of tag ? htmlAttributeData(tag) : []) {
        if (a.name.startsWith('on')) {
            const ev = '@' + a.name.slice(2);
            add(ev, vscode.CompletionItemKind.Event, '(event)', `1_${ev}`);
        }
        else {
            add(a.name, vscode.CompletionItemKind.Property, '(attribute)', `2_${a.name}`);
            add(':' + a.name, vscode.CompletionItemKind.Property, '(bound attribute)', `3_${a.name}`);
        }
    }
    return items;
}
// ---------------------------------------------------------------------------
// VS Code provider helpers
// ---------------------------------------------------------------------------
const SELECTOR = [
    { language: 'svelte', scheme: 'file' },
    { language: 'astro', scheme: 'file' },
    // .vue uses `<script setup>`, which the generic `<script>` branch in the
    // anchor/script helpers below already handles. The Vue extension runs no
    // language service on our `lang:'nmbl'` template region, so without this
    // forwarding there's no component completion / auto-import when typing a tag.
    { language: 'vue', scheme: 'file' },
];
/**
 * When the user has typed only a bare attribute prefix (`@`, `:`, or `#`),
 * `getWordRangeAtPosition` finds no word — return a range covering that single
 * prefix char so an inserted `@click` replaces the `@` instead of doubling it.
 */
function attrPrefixRange(doc, position) {
    const ch = doc.lineAt(position.line).text[position.character - 1];
    if (ch === '@' || ch === ':' || ch === '#') {
        return new vscode.Range(position.translate(0, -1), position);
    }
    return new vscode.Range(position, position);
}
/**
 * Convert a character offset in `doc` to a vscode.Position.
 */
function offsetToPosition(doc, offset) {
    return doc.positionAt(offset);
}
/**
 * Find the nmbl region at `position` in `doc`.
 * Returns the region or undefined.
 */
function nmblRegionAt(doc, position) {
    const text = doc.getText();
    const offset = doc.offsetAt(position);
    return isOffsetInNmblRegion(text, offset);
}
/**
 * Return a position inside the script/frontmatter block of `doc` that the TS
 * service will answer completions for.  Returns undefined when no block exists.
 */
function scriptAnchorPosition(doc) {
    const text = doc.getText();
    const offset = findScriptAnchorOffset(text, doc.languageId);
    if (offset === undefined)
        return undefined;
    return offsetToPosition(doc, offset);
}
// ---------------------------------------------------------------------------
// Completion item mapper
// ---------------------------------------------------------------------------
/**
 * Map a source CompletionItem from the script-block provider into a new item
 * targeted at the template word range.
 *
 * The additionalTextEdits are kept intact — they edit the script block of the
 * SAME document (e.g. adding an import), which is exactly what we want.
 * The original textEdit is discarded and replaced with a plain insertText.
 */
function mapToTemplateItem(source, templateWordRange, alreadyImported) {
    const label = getItemLabel(source.label);
    const item = new vscode.CompletionItem(source.label, source.kind);
    item.documentation = source.documentation;
    item.detail = source.detail
        ? `(component) ${source.detail}`
        : '(component)';
    item.insertText = label;
    item.range = templateWordRange;
    item.additionalTextEdits = source.additionalTextEdits;
    item.filterText = label;
    // Sort already-imported components first
    item.sortText = alreadyImported ? `0_${label}` : `1_${label}`;
    item.command = source.command;
    return item;
}
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerEmbeddedForwarding(context) {
    // Debug channel: open "Output → NMBL Forwarding" to trace why a completion
    // did or didn't fire. Quiet unless you look at it.
    const out = vscode.window.createOutputChannel('NMBL Forwarding');
    context.subscriptions.push(out);
    const log = (msg) => out.appendLine(msg);
    // ── Completion ────────────────────────────────────────────────────────────
    const completionProvider = vscode.languages.registerCompletionItemProvider(SELECTOR, {
        async provideCompletionItems(doc, position) {
            log(`completion @ ${doc.languageId} ${position.line}:${position.character}`);
            // 1. Must be inside an nmbl region
            const region = nmblRegionAt(doc, position);
            if (!region) {
                log('  bail: not inside an <template lang="nmbl"> region');
                return undefined;
            }
            const text = doc.getText();
            // 2. Attribute-name position (inside a tag's `(...)`) — offer directives,
            //    HTML attributes, and events. Checked BEFORE the tag-name flow because
            //    a multi-line attribute line has a whitespace prefix that also looks
            //    like a tag position.
            const before = text.slice(region.start, doc.offsetAt(position));
            const attrCtx = attributeContext(before);
            if (attrCtx.inAttr) {
                // Attribute names can carry `@`/`:`/`#` prefixes (events, binds, slots).
                const attrWordRange = doc.getWordRangeAtPosition(position, /[@:#]?[A-Za-z][\w-]*/) ??
                    attrPrefixRange(doc, position);
                const attrItems = buildAttributeItems(attrWordRange, attrCtx.tag);
                log(`  attr position (tag=${attrCtx.tag}) — ${attrItems.length} item(s)`);
                return new vscode.CompletionList(attrItems, true);
            }
            // 3. The word prefix must look like a tag-name position
            const wordRange = doc.getWordRangeAtPosition(position, /[A-Za-z][A-Za-z0-9_]*/);
            const wordStart = wordRange ? wordRange.start : position;
            // linePrefix = text from line start up to but not including the word
            const lineText = doc.lineAt(position.line).text;
            const linePrefix = lineText.substring(0, wordStart.character);
            if (!isTagNamePosition(linePrefix)) {
                log(`  bail: not a tag-name position (linePrefix=${JSON.stringify(linePrefix)})`);
                return undefined;
            }
            const effectiveWordRange = wordRange ?? new vscode.Range(position, position);
            // 4. Standard HTML tags — always available at a tag position, no proxy.
            const htmlItems = buildHtmlTagItems(effectiveWordRange);
            // 4. Component candidates — proxy completion to the script/frontmatter
            //    anchor so the host TS service answers (auto-import edits included).
            //    Best-effort: a missing anchor or empty result still yields HTML tags.
            const componentItems = [];
            const anchor = scriptAnchorPosition(doc);
            if (!anchor) {
                log('  no <script> anchor — html tags only');
            }
            else {
                try {
                    const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', doc.uri, anchor, undefined, 60);
                    const items = !result
                        ? []
                        : Array.isArray(result)
                            ? result
                            : result.items;
                    log(`  host returned ${items.length} items`);
                    const scriptRegion = findScriptBlockText(text, doc.languageId);
                    for (const item of items) {
                        if (!isComponentCandidate(item))
                            continue;
                        const label = getItemLabel(item.label);
                        // Heuristic: already imported if the identifier appears in the script
                        const alreadyImported = scriptRegion
                            ? new RegExp(`\\b${escapeRegExp(label)}\\b`).test(scriptRegion)
                            : false;
                        componentItems.push(mapToTemplateItem(item, effectiveWordRange, alreadyImported));
                    }
                }
                catch (e) {
                    log(`  host completion threw ${e} — html tags only`);
                }
            }
            log(`  kept ${componentItems.length} component(s) + ${htmlItems.length} html tag(s)`);
            return new vscode.CompletionList([...componentItems, ...htmlItems], true);
        },
    });
    // ── Definition ────────────────────────────────────────────────────────────
    const definitionProvider = vscode.languages.registerDefinitionProvider(SELECTOR, {
        async provideDefinition(doc, position) {
            if (!nmblRegionAt(doc, position))
                return undefined;
            const wordRange = doc.getWordRangeAtPosition(position, /[A-Z][A-Za-z0-9_]*/);
            if (!wordRange)
                return undefined;
            const word = doc.getText(wordRange);
            if (!isPascalCase(word))
                return undefined;
            // Find the identifier in the script/frontmatter block
            const text = doc.getText();
            const scriptPos = findWordInScript(text, word, doc.languageId);
            if (scriptPos === undefined)
                return undefined;
            try {
                const result = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', doc.uri, doc.positionAt(scriptPos));
                return result && result.length > 0 ? result : undefined;
            }
            catch {
                return undefined;
            }
        },
    });
    // ── Hover ─────────────────────────────────────────────────────────────────
    const hoverProvider = vscode.languages.registerHoverProvider(SELECTOR, {
        async provideHover(doc, position) {
            if (!nmblRegionAt(doc, position))
                return undefined;
            const wordRange = doc.getWordRangeAtPosition(position, /[A-Z][A-Za-z0-9_]*/);
            if (!wordRange)
                return undefined;
            const word = doc.getText(wordRange);
            if (!isPascalCase(word))
                return undefined;
            const text = doc.getText();
            const scriptPos = findWordInScript(text, word, doc.languageId);
            if (scriptPos === undefined)
                return undefined;
            try {
                const result = await vscode.commands.executeCommand('vscode.executeHoverProvider', doc.uri, doc.positionAt(scriptPos));
                return result && result.length > 0 ? result[0] : undefined;
            }
            catch {
                return undefined;
            }
        },
    });
    context.subscriptions.push(completionProvider, definitionProvider, hoverProvider);
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/** Extract the raw text of the script or frontmatter block. */
function findScriptBlockText(text, languageId) {
    if (languageId === 'astro') {
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
        return fm ? fm[1] : undefined;
    }
    const m = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(text);
    return m ? m[1] : undefined;
}
/**
 * Find the character offset of the first occurrence of `word` (whole-word match)
 * inside the script/frontmatter block. Returns undefined if not found.
 */
function findWordInScript(text, word, languageId) {
    if (languageId === 'astro') {
        const fm = /^---\r?\n/.exec(text);
        if (!fm)
            return undefined;
        const bodyStart = fm[0].length;
        const fmEnd = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
        if (!fmEnd)
            return undefined;
        const blockText = text.substring(bodyStart, bodyStart + fmEnd[1].length);
        const idx = findWordIndex(blockText, word);
        if (idx === -1)
            return undefined;
        return bodyStart + idx;
    }
    else {
        const m = /<script[^>]*>/.exec(text);
        if (!m)
            return undefined;
        const bodyStart = m.index + m[0].length;
        const bodyEnd = text.indexOf('</script>', bodyStart);
        if (bodyEnd === -1)
            return undefined;
        const blockText = text.substring(bodyStart, bodyEnd);
        const idx = findWordIndex(blockText, word);
        if (idx === -1)
            return undefined;
        return bodyStart + idx;
    }
}
/** Find the offset of `word` as a whole-word match in `text`. Returns -1 if not found. */
function findWordIndex(text, word) {
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`);
    const m = re.exec(text);
    return m ? m.index : -1;
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
