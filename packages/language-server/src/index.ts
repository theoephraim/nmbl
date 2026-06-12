import {
  createConnection,
  createServer,
  createSimpleProject,
} from '@volar/language-server/node';
import { create as createHtmlService } from 'volar-service-html';
import { URI } from 'vscode-uri';
import { nmblLanguagePlugin, NmblVirtualCode, NmblHostVirtualCode } from './language-plugin.js';

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize((params) => {
  return server.initialize(
    params,
    createSimpleProject([nmblLanguagePlugin]),
    [
      // Provide HTML completions / hover / diagnostics on the embedded html code
      createHtmlService(),

      // Custom service plugin: report NMBL compile errors as diagnostics
      {
        name: 'nmbl-diagnostics',
        capabilities: {
          diagnosticProvider: {
            interFileDependencies: false,
            workspaceDiagnostics: false,
          },
        },
        create(context) {
          return {
            provideDiagnostics(document) {
              const uri = URI.parse(document.uri);
              const path = uri.path;

              // Only operate on NMBL-related source files
              const isNmbl = path.endsWith('.nmbl');
              const isSvelte = path.endsWith('.svelte');
              const isAstro = path.endsWith('.astro');
              if (!isNmbl && !isSvelte && !isAstro) return;

              const sourceScript = context.language.scripts.get(uri);
              if (!sourceScript?.generated) return;

              const root = sourceScript.generated.root;

              // Standalone .nmbl file
              if (root instanceof NmblVirtualCode) {
                return root.compileErrors.map((err) => {
                  const startOffset = err.span?.start.offset ?? 0;
                  const endOffset = err.span?.end.offset ?? startOffset;
                  return {
                    severity: 1 as const,
                    range: {
                      start: document.positionAt(startOffset),
                      end: document.positionAt(endOffset),
                    },
                    source: 'nmbl',
                    message: err.message,
                    code: err.code,
                  };
                });
              }

              // Host document (.svelte / .astro) with embedded NMBL region —
              // the error spans have already been shifted to host-document offsets
              // by NmblHostVirtualCode's constructor.
              if (root instanceof NmblHostVirtualCode) {
                return root.compileErrors.map((err) => {
                  const startOffset = err.span?.start.offset ?? 0;
                  const endOffset = err.span?.end.offset ?? startOffset;
                  return {
                    severity: 1 as const,
                    range: {
                      start: document.positionAt(startOffset),
                      end: document.positionAt(endOffset),
                    },
                    source: 'nmbl',
                    message: err.message,
                    code: err.code,
                  };
                });
              }

              return [];
            },
          };
        },
      },
    ],
  );
});

connection.onInitialized(server.initialized);
connection.onShutdown(server.shutdown);
