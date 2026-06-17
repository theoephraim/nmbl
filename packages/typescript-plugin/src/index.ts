/**
 * @nmbl-lang/typescript-plugin
 *
 * A tsserver language-service plugin. It wraps the host language service and
 * removes "declared but never used" diagnostics for imports/locals that are
 * actually referenced inside an `` nmbl`…` `` tagged template — references TS
 * can't otherwise see because the template body is an opaque string.
 *
 * Enable it in tsconfig.json:
 *
 *   {
 *     "compilerOptions": {
 *       "plugins": [{ "name": "@nmbl-lang/typescript-plugin" }]
 *     }
 *   }
 *
 * In VS Code, also run "TypeScript: Select TypeScript Version" → "Use Workspace
 * Version" so tsserver loads project plugins.
 */

import type * as ts from 'typescript';
import { collectNmblIdentifiers, filterUnusedDiagnostics } from './core';

type TsModule = typeof import('typescript');

interface PluginConfig {
  /** The tagged-template tag to recognise. Defaults to `nmbl`. */
  tagName?: string;
}

function init(modules: { typescript: TsModule }) {
  const tsModule = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const tagName =
      (info.config as PluginConfig | undefined)?.tagName ?? 'nmbl';
    const ls = info.languageService;

    // Proxy every method straight through, then override the two diagnostic
    // entrypoints. (`getSuggestionDiagnostics` is what greys out unused imports
    // in the editor by default; `getSemanticDiagnostics` is the noUnusedLocals
    // path. We cover both.)
    const proxy = Object.create(null) as ts.LanguageService;
    const proxyRecord = proxy as unknown as Record<string, unknown>;
    for (const key of Object.keys(ls) as Array<keyof ts.LanguageService>) {
      const member = ls[key];
      proxyRecord[key] =
        typeof member === 'function'
          ? (...args: unknown[]) => (member as (...a: unknown[]) => unknown).apply(ls, args)
          : member;
    }

    function filterFor<T extends ts.Diagnostic>(fileName: string, prior: T[]): T[] {
      const sourceFile = ls.getProgram()?.getSourceFile(fileName);
      if (!sourceFile) return prior;
      const idents = collectNmblIdentifiers(tsModule, sourceFile, tagName);
      return filterUnusedDiagnostics(prior, sourceFile, idents);
    }

    proxy.getSemanticDiagnostics = (fileName) =>
      filterFor(fileName, ls.getSemanticDiagnostics(fileName));

    proxy.getSuggestionDiagnostics = (fileName) =>
      filterFor(fileName, ls.getSuggestionDiagnostics(fileName));

    info.project.projectService.logger.info(
      `[@nmbl-lang/typescript-plugin] active (tag: ${tagName})`,
    );

    return proxy;
  }

  return { create };
}

export = init;
