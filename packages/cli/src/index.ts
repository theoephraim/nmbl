// Programmatic entry point for @nmbl-lang/cli — the same format/lint logic the
// `nmbl` binary uses, importable from other tools.
export {
  collectFiles, formatContent, lintContent, readFile,
  type FormatOutcome, type LintOutcome, type MappedLintMessage,
} from './core.js';
