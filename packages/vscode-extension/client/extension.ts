import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { registerEmbeddedForwarding } from './embedded-forwarding';
import { registerConversions } from './convert';
import { registerFormatting } from './format';

let client: LanguageClient;

export function activate(context: ExtensionContext): void {
  // Resolve the language server module from the installed @nmbl/language-server package.
  // The server is a standalone Node.js module that communicates via IPC.
  const serverModule = require.resolve('@nmbl/language-server');

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6009'],
      },
    },
  };

  const clientOptions: LanguageClientOptions = {
    // Activate for:
    //  - standalone .nmbl files
    //  - .svelte files (may contain <template lang="nmbl">)
    //  - .astro files (may contain <template lang="nmbl">)
    // NOT .vue — full Vue support is provided by the separate
    // @nmbl/vue-language-plugin-nmbl Volar plugin; duplicating here would
    // cause double-reported diagnostics.
    documentSelector: [
      { language: 'nmbl' },
      { language: 'svelte' },
      { language: 'astro' },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.{nmbl,svelte,astro}'),
    },
  };

  client = new LanguageClient(
    'nmbl-language-server',
    'NMBL Language Server',
    serverOptions,
    clientOptions,
  );

  client.start();

  // Register provider forwarding for component names inside <template lang="nmbl">
  // regions of .svelte/.astro files.
  registerEmbeddedForwarding(context);

  // Register paste-HTML-as-NMBL provider + conversion commands.
  registerConversions(context);

  // Register the document formatter (.nmbl) + format-document command.
  registerFormatting(context);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}
