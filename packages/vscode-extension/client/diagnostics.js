"use strict";
/**
 * diagnostics.ts
 *
 * Publishes NMBL's own compile errors and lint findings for `<template
 * lang="nmbl">` regions of `.vue` files, under our own DiagnosticCollection so
 * they carry `source: 'nmbl'`.
 *
 * Why here and not the Vue language plugin: a VueLanguagePlugin can only report
 * through Vue's `onError`/`onWarn` channel, and Vue stamps every diagnostic from
 * that channel with `source: 'vue'` — misleading for an NMBL lint rule. Owning
 * the DiagnosticCollection lets us label it correctly. (`.svelte`/`.astro`/
 * `.nmbl` get theirs from the NMBL language server; this covers `.vue`, which the
 * Vue extension otherwise drives.)
 *
 * `computeNmblDiagnostics` is pure (text in, findings out) and unit-tested; the
 * VS Code wiring (region detection, offset→position, publishing) is thin.
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
exports.computeNmblDiagnostics = computeNmblDiagnostics;
exports.registerNmblDiagnostics = registerNmblDiagnostics;
const vscode = __importStar(require("vscode"));
const embedded_forwarding_1 = require("./embedded-forwarding");
// Lazy ESM import of @nmbl-lang/core (this module is CJS; cast like convert.ts/
// format.ts to avoid a CJS-importing-ESM type error).
let corePromise;
function getCore() {
    return (corePromise ?? (corePromise = import('@nmbl-lang/core')));
}
/**
 * Run NMBL's compiler + linter over a template region and return findings with
 * region-relative offsets. Compile errors are errors; lint findings keep their
 * own severity. Never throws — returns [] on failure.
 */
async function computeNmblDiagnostics(regionText, framework) {
    let core;
    try {
        core = await getCore();
    }
    catch {
        return [];
    }
    const out = [];
    try {
        const { errors } = core.compile(regionText, { framework });
        for (const e of errors) {
            out.push({ severity: 'error', message: e.message, start: e.span.start.offset, end: e.span.end.offset });
        }
    }
    catch {
        /* ignore compile crash */
    }
    try {
        for (const m of core.lint(regionText)) {
            out.push({
                severity: m.severity === 'error' ? 'error' : 'warning',
                message: `${m.message} (${m.ruleId})`,
                start: m.span.start.offset,
                end: m.span.end.offset,
            });
        }
    }
    catch {
        /* ignore lint crash */
    }
    return out;
}
function frameworkFor(languageId) {
    if (languageId === 'svelte')
        return 'svelte';
    if (languageId === 'astro')
        return 'astro';
    return 'vue';
}
/**
 * Register the NMBL DiagnosticCollection for `.vue` files. `.svelte`/`.astro`/
 * `.nmbl` are handled by the NMBL language server, so they're excluded here to
 * avoid duplicate diagnostics.
 */
function registerNmblDiagnostics(context) {
    const collection = vscode.languages.createDiagnosticCollection('nmbl');
    context.subscriptions.push(collection);
    async function refresh(doc) {
        if (doc.languageId !== 'vue')
            return;
        const text = doc.getText();
        const region = (0, embedded_forwarding_1.findNmblRegion)(text);
        if (!region) {
            collection.delete(doc.uri);
            return;
        }
        const regionText = text.slice(region.start, region.end);
        const findings = await computeNmblDiagnostics(regionText, frameworkFor(doc.languageId));
        collection.set(doc.uri, findings.map((f) => {
            const range = new vscode.Range(doc.positionAt(region.start + f.start), doc.positionAt(region.start + f.end));
            const diag = new vscode.Diagnostic(range, f.message, f.severity === 'error'
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning);
            diag.source = 'nmbl';
            return diag;
        }));
    }
    // Debounce re-analysis on edits.
    const timers = new Map();
    function schedule(doc) {
        const key = doc.uri.toString();
        const existing = timers.get(key);
        if (existing)
            clearTimeout(existing);
        timers.set(key, setTimeout(() => { timers.delete(key); void refresh(doc); }, 300));
    }
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => void refresh(doc)), vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)), vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)));
    for (const editor of vscode.window.visibleTextEditors)
        void refresh(editor.document);
}
