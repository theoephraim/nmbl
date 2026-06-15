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

import * as vscode from 'vscode';
import { findNmblRegion } from './embedded-forwarding';

export interface NmblDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  /** Offsets relative to the region text. */
  start: number;
  end: number;
}

// Lazy ESM import of @nmbl-lang/core (this module is CJS; cast like convert.ts/
// format.ts to avoid a CJS-importing-ESM type error).
let corePromise: Promise<any> | undefined;
function getCore(): Promise<any> {
  return (corePromise ??= import('@nmbl-lang/core') as Promise<any>);
}

/**
 * Run NMBL's compiler + linter over a template region and return findings with
 * region-relative offsets. Compile errors are errors; lint findings keep their
 * own severity. Never throws — returns [] on failure.
 */
export async function computeNmblDiagnostics(
  regionText: string,
  framework: 'vue' | 'svelte' | 'astro' | 'html',
): Promise<NmblDiagnostic[]> {
  let core: any;
  try {
    core = await getCore();
  } catch {
    return [];
  }
  const out: NmblDiagnostic[] = [];

  try {
    const { errors } = core.compile(regionText, { framework });
    for (const e of errors) {
      out.push({ severity: 'error', message: e.message, start: e.span.start.offset, end: e.span.end.offset });
    }
  } catch {
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
  } catch {
    /* ignore lint crash */
  }

  return out;
}

function frameworkFor(languageId: string): 'vue' | 'svelte' | 'astro' | 'html' {
  if (languageId === 'svelte') return 'svelte';
  if (languageId === 'astro') return 'astro';
  return 'vue';
}

/**
 * Register the NMBL DiagnosticCollection for `.vue` files. `.svelte`/`.astro`/
 * `.nmbl` are handled by the NMBL language server, so they're excluded here to
 * avoid duplicate diagnostics.
 */
export function registerNmblDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('nmbl');
  context.subscriptions.push(collection);

  async function refresh(doc: vscode.TextDocument): Promise<void> {
    if (doc.languageId !== 'vue') return;
    const text = doc.getText();
    const region = findNmblRegion(text);
    if (!region) {
      collection.delete(doc.uri);
      return;
    }
    const regionText = text.slice(region.start, region.end);
    const findings = await computeNmblDiagnostics(regionText, frameworkFor(doc.languageId));
    collection.set(
      doc.uri,
      findings.map((f) => {
        const range = new vscode.Range(
          doc.positionAt(region.start + f.start),
          doc.positionAt(region.start + f.end),
        );
        const diag = new vscode.Diagnostic(
          range,
          f.message,
          f.severity === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning,
        );
        diag.source = 'nmbl';
        return diag;
      }),
    );
  }

  // Debounce re-analysis on edits.
  const timers = new Map<string, NodeJS.Timeout>();
  function schedule(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(key, setTimeout(() => { timers.delete(key); void refresh(doc); }, 300));
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => void refresh(doc)),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
  );
  for (const editor of vscode.window.visibleTextEditors) void refresh(editor.document);
}
