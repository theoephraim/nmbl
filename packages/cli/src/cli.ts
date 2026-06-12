#!/usr/bin/env node
// cli.ts — the `nmbl` command-line entry point.
//
//   nmbl format <paths…> [--write|-w] [--check] [--indent N] [--print-width N]
//   nmbl lint   <paths…> [--quiet] [--max-warnings N]
//
// Designed to drop into existing toolchains: `nmbl format --check` for CI,
// `nmbl format --write` for a pre-commit hook / lint-staged, `nmbl lint` for
// diagnostics. Works on `.nmbl` files and on NMBL embedded in Vue/Svelte/Astro
// SFCs and JSX tagged templates.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  collectFiles, formatContent, lintContent, readFile,
  type MappedLintMessage,
} from './core.js';

const VERSION = '0.1.0';

// ── Tiny ANSI helpers (no dependency; honor NO_COLOR + TTY). ──
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const color = (code: number) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = color(31), green = color(32), yellow = color(33), dim = color(2), bold = color(1);

function main(argv: string[]): number {
  const command = argv[0];
  const rest = argv.slice(1);

  if (command === '--version' || command === '-v') { console.log(VERSION); return 0; }
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return command ? 0 : 1;
  }

  switch (command) {
    case 'format': return runFormat(rest);
    case 'lint': return runLint(rest);
    default:
      console.error(red(`Unknown command '${command}'.`));
      printHelp();
      return 1;
  }
}

function runFormat(args: string[]): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      write: { type: 'boolean', short: 'w', default: false },
      check: { type: 'boolean', default: false },
      indent: { type: 'string' },
      'print-width': { type: 'string' },
    },
  });

  if (positionals.length === 0) {
    console.error(red('No files specified. Usage: nmbl format <paths…> [--write|--check]'));
    return 1;
  }

  const options = {
    indent: values.indent ? Number(values.indent) : undefined,
    printWidth: values['print-width'] ? Number(values['print-width']) : undefined,
  };

  let files: string[];
  try { files = collectFiles(positionals); } catch (e) {
    console.error(red((e as Error).message));
    return 1;
  }

  const write = values.write as boolean;
  const check = values.check as boolean;
  const toStdout = !write && !check;

  if (toStdout && files.length > 1) {
    console.error(red('Refusing to print multiple files to stdout — use --write or --check.'));
    return 1;
  }

  let changedCount = 0;
  let errorCount = 0;
  const unformatted: string[] = [];

  for (const file of files) {
    let content: string;
    try { content = readFile(file); } catch (e) {
      console.error(red(`Cannot read ${file}: ${(e as Error).message}`));
      errorCount++;
      continue;
    }

    const outcome = formatContent(file, content, options);

    if (outcome.errors.length) {
      errorCount++;
      const first = outcome.errors[0];
      console.error(
        red(`✖ ${file}`) +
        dim(` — ${first.message} (line ${first.span.start.line + 1})`),
      );
      continue;
    }
    for (const s of outcome.skipped) {
      console.error(yellow(`⚠ ${file}`) + dim(` — skipped a region (${s.reason})`));
    }

    if (toStdout) {
      process.stdout.write(outcome.output);
      continue;
    }

    if (outcome.changed) {
      changedCount++;
      unformatted.push(file);
      if (write) {
        try { writeFileSync(file, outcome.output); } catch (e) {
          console.error(red(`Cannot write ${file}: ${(e as Error).message}`));
          errorCount++;
        }
      }
    }
  }

  if (check) {
    if (unformatted.length) {
      console.error(bold(`\n${unformatted.length} file(s) are not formatted:`));
      for (const f of unformatted) console.error(`  ${f}`);
      return 1;
    }
    if (errorCount === 0) console.error(green(`All ${files.length} file(s) are formatted.`));
  } else if (write) {
    console.error(
      changedCount > 0
        ? green(`Formatted ${changedCount} file(s).`)
        : dim(`No changes — ${files.length} file(s) already formatted.`),
    );
  }

  return errorCount > 0 ? 1 : 0;
}

function runLint(args: string[]): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      quiet: { type: 'boolean', default: false },
      'max-warnings': { type: 'string' },
    },
  });

  if (positionals.length === 0) {
    console.error(red('No files specified. Usage: nmbl lint <paths…> [--quiet]'));
    return 1;
  }

  let files: string[];
  try { files = collectFiles(positionals); } catch (e) {
    console.error(red((e as Error).message));
    return 1;
  }

  const quiet = values.quiet as boolean;
  const maxWarnings = values['max-warnings'] !== undefined ? Number(values['max-warnings']) : Infinity;

  let errorTotal = 0;
  let warnTotal = 0;

  for (const file of files) {
    let content: string;
    try { content = readFile(file); } catch (e) {
      console.error(red(`Cannot read ${file}: ${(e as Error).message}`));
      errorTotal++;
      continue;
    }

    const { messages } = lintContent(file, content);
    const shown = quiet ? messages.filter((m) => m.severity === 'error') : messages;
    if (shown.length === 0) continue;

    console.error(bold(file));
    for (const m of shown) printLintMessage(m);
    errorTotal += messages.filter((m) => m.severity === 'error').length;
    warnTotal += messages.filter((m) => m.severity === 'warning').length;
  }

  const parts: string[] = [];
  if (errorTotal) parts.push(red(`${errorTotal} error(s)`));
  if (warnTotal) parts.push(yellow(`${warnTotal} warning(s)`));
  if (parts.length) console.error('\n' + parts.join(', '));
  else console.error(green('No problems found.'));

  if (errorTotal > 0) return 1;
  if (warnTotal > maxWarnings) {
    console.error(red(`Too many warnings (${warnTotal} > ${maxWarnings}).`));
    return 1;
  }
  return 0;
}

function printLintMessage(m: MappedLintMessage): void {
  const loc = dim(`${m.line}:${m.column}`);
  const sev = m.severity === 'error' ? red('error') : yellow('warn ');
  const fix = m.fixable ? dim(' (fixable with `nmbl format`)') : '';
  console.error(`  ${loc}  ${sev}  ${m.message}  ${dim(m.ruleId)}${fix}`);
}

function printHelp(): void {
  console.log(`${bold('nmbl')} — formatter & linter for the NMBL shorthand HTML language

${bold('Usage')}
  nmbl format <paths…> [options]   Format .nmbl files and embedded NMBL regions
  nmbl lint   <paths…> [options]   Report best-practice & correctness diagnostics

${bold('format options')}
  -w, --write          Rewrite files in place
      --check          Exit non-zero if any file is not already formatted (CI)
      --indent <n>     Indentation width in spaces (default 2)
      --print-width <n>  Column at which attribute lists wrap (default 100)
  (with neither --write nor --check, the formatted result is printed to stdout)

${bold('lint options')}
      --quiet              Only report errors, not warnings
      --max-warnings <n>   Exit non-zero if warnings exceed this count

${bold('other')}
  -v, --version        Print version
  -h, --help           Show this help

${bold('Paths')} may be files or directories. Directories are searched for
.nmbl, .vue, .svelte, .astro, .jsx and .tsx files (node_modules and build
output are skipped). Embedded NMBL lives in <template lang="nmbl"> blocks and
nmbl\`…\` tagged templates.`);
}

process.exit(main(process.argv.slice(2)));
