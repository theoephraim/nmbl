"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
const embedded_forwarding_1 = require("./embedded-forwarding");
let client;
function activate(context) {
    // Resolve the language server module from the installed @nmbl/language-server package.
    // The server is a standalone Node.js module that communicates via IPC.
    const serverModule = require.resolve('@nmbl/language-server');
    const serverOptions = {
        run: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
        },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
            options: {
                execArgv: ['--nolazy', '--inspect=6009'],
            },
        },
    };
    const clientOptions = {
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
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/*.{nmbl,svelte,astro}'),
        },
    };
    client = new node_1.LanguageClient('nmbl-language-server', 'NMBL Language Server', serverOptions, clientOptions);
    client.start();
    // Register provider forwarding for component names inside <template lang="nmbl">
    // regions of .svelte/.astro files.
    (0, embedded_forwarding_1.registerEmbeddedForwarding)(context);
}
function deactivate() {
    if (!client)
        return undefined;
    return client.stop();
}
