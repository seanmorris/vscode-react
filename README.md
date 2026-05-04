# vscode-react

`vscode-react` embeds a browser-hosted VS Code workbench inside a React application and bridges it to the host page with [quickbus](https://github.com/seanmorris/quickbus).

It expects the embedded VS Code host to include the [file-bus](https://github.com/seanmorris/file-bus) extension so file-system requests can be served by the outer page. You can build and host that companion VS Code instance with [vscode-static-web](https://github.com/seanmorris/vscode-static-web).

## Installation

```bash
npm install vscode-react
```

This package exports:

- `useVSCode`
- `createDebugAdapterHost`

## Usage

```jsx
import React from 'react';
import { createDebugAdapterHost, useVSCode } from 'vscode-react';

function App() {
  const fsHandlers = {
    readdir(path) {
      return ['demo.php'];
    },
    async readFile(path) {
      return Array.from(new TextEncoder().encode('<?php echo "Hello";'));
    },
    analyzePath(path) {
      if (path === '/' || path === '/workspace') {
        return { exists: true, object: { isFolder: true } };
      }

      if (path === '/workspace/demo.php') {
        return { exists: true, object: { isFolder: false } };
      }

      return { exists: false, object: { isFolder: false } };
    }
  };

  const debugHost = createDebugAdapterHost({
    commands: {
      async initialize({ sendEvent }) {
        await sendEvent('initialized');
        return {
          supportsConfigurationDoneRequest: true
        };
      },
      launch() {
        return {};
      },
      setBreakpoints({ arguments: args }) {
        return {
          breakpoints: (args?.breakpoints ?? []).map(breakpoint => ({
            verified: true,
            line: breakpoint.line
          }))
        };
      },
      async configurationDone({ sendEvent }) {
        await sendEvent('stopped', {
          reason: 'entry',
          threadId: 1,
          allThreadsStopped: true
        });

        return {};
      },
      threads() {
        return {
          threads: [{ id: 1, name: 'Main Thread' }]
        };
      },
      stackTrace() {
        return {
          stackFrames: [{
            id: 1,
            name: 'main',
            line: 1,
            column: 1,
            source: {
              name: 'demo.php',
              path: '/workspace/demo.php'
            }
          }],
          totalFrames: 1
        };
      },
      scopes() {
        return {
          scopes: [{
            name: 'Locals',
            variablesReference: 0,
            expensive: false
          }]
        };
      },
      continue() {
        return {
          allThreadsContinued: true
        };
      },
      async disconnect({ sendEvent }) {
        await sendEvent('terminated');
        return {};
      }
    }
  });

  const { VSCode, openFile, startDebugging, sendDebugAdapterMessage } = useVSCode({
    url: 'https://your-vscode-host.example/editor/',
    fsHandlers,
    dbgHandlers: debugHost.dbgHandlers,
  });

  debugHost.attachBridge({ sendDebugAdapterMessage });

  async function runDebugger() {
    await openFile('/workspace/demo.php');
    await startDebugging({
      type: 'dbgBus',
      request: 'launch',
      name: 'PHP DBG Wasm',
      program: '/workspace/demo.php'
    });
  }

  return <VSCode className="editor" />;
}

export default App;
```

The `url` should point at a VS Code web host that includes `file-bus`. If you
want debugger support as well, that host also needs `dbg-bus`. If you control
the host with `vscode-web-static`, add the needed extensions under
`extra_extensions/` and serve that build.

## Hook API

### `useVSCode(options)`

| Option        | Type   | Description                                      |
| ------------- | ------ | ------------------------------------------------ |
| url           | string | Base URL of the VSCode editor server.            |
| fsHandlers    | object | Custom file-system handler callbacks.            |
| dbgHandlers   | object | Optional host-side debugger bridge callbacks.    |

#### Returned values

| Return                    | Type                                        | Description                                           |
| ------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| `VSCode`                  | React component                             | The iframe-based VSCode component to render.          |
| `openFile`                | `(path: string) => Promise<any> \| void`    | Opens the given file in the VSCode editor.            |
| `executeCommand`          | `(command: string, ...args: any[]) => Promise<any> \| void` | Executes a VS Code command in the editor. |
| `startDebugging`          | `(configuration: object, options?: object) => Promise<any> \| void` | Starts a `dbgBus` debug session.      |
| `stopDebugging`           | `(sessionId?: string) => Promise<any> \| void` | Stops a `dbgBus` debug session.                 |
| `sendDebugAdapterMessage` | `(sessionId: string, message: object) => Promise<any> \| void` | Sends one DAP message into the debug session. |
| `customRequest`           | `(sessionId: string, command: string, args?: any) => Promise<any> \| void` | Sends a custom debug request. |
| `listDebugSessions`       | `() => Promise<any> \| void`                | Lists active debug sessions known to `dbg-bus`.       |
| `listBreakpoints`         | `() => Promise<any> \| void`                | Lists all VS Code breakpoints.                        |
| `listOpenBreakpoints`     | `() => Promise<any> \| void`                | Lists breakpoints for open editors.                   |
| `addBreakpoint`           | `(uri: string, line: number, column?: number) => Promise<any> \| void` | Adds a source breakpoint through `dbg-bus`. |

### `createDebugAdapterHost(options)`

Creates a small host-side DAP wrapper for `dbg-bus`. It tracks sessions,
wraps request handlers into valid DAP responses, and can emit DAP events back
into VS Code through `sendDebugAdapterMessage(...)`.

| Option            | Type   | Description                                                        |
| ----------------- | ------ | ------------------------------------------------------------------ |
| `commands`        | object | Map of DAP request names such as `initialize` or `stackTrace`.     |
| `onSessionEvent`  | function | Optional lifecycle callback for `dbg-bus` session notifications. |

#### Returned values

| Return              | Type     | Description                                                       |
| ------------------- | -------- | ----------------------------------------------------------------- |
| `dbgHandlers`       | object   | Host callbacks to pass into `useVSCode({ dbgHandlers })`.         |
| `attachBridge`      | function | Binds the helper to a `sendDebugAdapterMessage` function.         |
| `getSession`        | function | Returns one tracked debug session by id or the active session.    |
| `getActiveSession`  | function | Returns the active debug session or `null`.                       |
| `listSessions`      | function | Returns a snapshot array of tracked debug sessions.               |
| `sendEvent`         | function | Sends one DAP event into an active debug session.                 |
| `sendRequest`       | function | Sends one DAP request into an active debug session.               |

### Available VS Code commands

`executeCommand` proxies to the VS Code command registry. You can call any built-in or extension command by its identifier. For example:

- `workbench.action.files.newUntitledFile`
- `workbench.action.openFolder`
- `workbench.action.quickOpen`
- `workbench.action.findInFiles`
- `editor.action.gotoLine`
- `editor.action.rename`

See the [full list of VS Code commands](https://code.visualstudio.com/api/references/commands).

## File System Handlers

The `fsHandlers` option lets you override the file-system callbacks. This API
mirrors the [file-bus](https://github.com/seanmorris/file-bus) host-page
contract, which is loosely modeled on filesystem-style operations. By default,
this hook uses the following stub handlers:

```js
const defaultFsHandlers = {
  readdir(path: string, opts?: object): string[],
  async readFile(path: string, opts?: object): number[],
  analyzePath(path: string): { exists: boolean, object?: { isFolder?: boolean } },
  writeFile(path: string, data: number[]): void,
  rename(oldPath: string, newPath: string): void,
  mkdir(path: string, opts?: { recursive?: boolean }): void,
  unlink(path: string): void,
  rmdir(path: string): void,
  activate(): void
};
```

### Handler signatures

| Handler      | Signature                                                                  | Description                                                                                 |
| ------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `readdir`    | `(path: string, opts?: object) => string[]`                                | Reads a directory and returns an array of entry names.                                      |
| `readFile`   | `(path: string, opts?: object) => Promise<number[]>`                       | Reads a file and returns content as an array of bytes (`number[]`).                         |
| `analyzePath`| `(path: string) => { exists: boolean, object?: { isFolder?: boolean } }`   | Checks if the path exists and whether `file-bus` should treat it as a folder.              |
| `writeFile`  | `(path: string, data: number[]) => void`                                   | Writes raw bytes to a file (data should be an array of numbers representing bytes).         |
| `rename`     | `(oldPath: string, newPath: string) => void`                               | Renames or moves a file or directory.                                                       |
| `mkdir`      | `(path: string, opts?: { recursive?: boolean }) => void`                   | Creates a directory. Use `opts.recursive` to create nested directories if needed.           |
| `unlink`     | `(path: string) => void`                                                   | Removes a file.                                                                             |
| `rmdir`      | `(path: string) => void`                                                   | Removes a (empty) directory.                                                                |
| `activate`   | `() => void`                                                               | Called when the FS bridge is activated (e.g., after initial mount).                         |

## Debug Handlers

The `dbgHandlers` option lets the host page provide the runtime-facing half of
the [`dbg-bus`](https://github.com/seanmorris/vscode-static-web/tree/main/extra_extensions/dbg-bus)
bridge. These handlers are optional until you actually start a `dbgBus`
session.

If `dbgHandlers.acceptVSCodeMessage(...)` is omitted, `vscode-react` returns a
generic DAP failure response so VS Code fails clearly instead of waiting
forever for a missing host adapter.

### Handler signatures

| Handler                     | Signature                                                | Description                                                        |
| --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `acceptVSCodeMessage`       | `(session: object, message: object) => Promise<object> \| object` | Accepts one DAP request from VS Code and returns the adapter reply. |
| `debugSessionStarted`       | `(session: object) => void`                              | Called when the inline adapter is created for a new debug session. |
| `didStartDebugSession`      | `(session: object) => void`                              | Called when VS Code reports that the session has started.          |
| `didTerminateDebugSession`  | `(session: object) => void`                              | Called when VS Code terminates the session.                        |
| `didChangeActiveDebugSession` | `(session: object \| null) => void`                    | Called when the active debug session changes.                      |

## Minimal DAP Flow

The smallest useful `dbg-bus` flow looks like this:

1. VS Code sends `initialize`.
2. Your host responds with capabilities and emits `initialized`.
3. VS Code sends `launch` or `attach`.
4. VS Code sends `setBreakpoints`.
5. VS Code sends `configurationDone`.
6. Your host emits `stopped` when the runtime reaches a pause point.
7. VS Code asks for `threads`, `stackTrace`, and `scopes`.
8. VS Code sends stepping or resume requests such as `continue`.
9. Your host emits `terminated` when the session exits.

The `createDebugAdapterHost(...)` helper is designed around that flow. A basic
command map normally covers:

- `initialize`
- `launch` or `attach`
- `setBreakpoints`
- `configurationDone`
- `threads`
- `stackTrace`
- `scopes`
- `continue`
- `disconnect`

The unit tests in [tests/createDebugAdapterHost.test.mjs](/app/tests/createDebugAdapterHost.test.mjs:1)
exercise that exact sequence with a minimal single-thread session.

## Tests

```bash
npm test
```

```bash
npm run test:e2e
```

The browser E2E test bundles a small React harness, serves it alongside a local
`vscode-web-static` build, and verifies that a real embedded VS Code workbench
can:

- boot successfully
- request file data over `file-bus`
- open a file through `openFile(...)`
- accept `executeCommand(...)`
- add a breakpoint through `dbg-bus`
- start and stop a real `dbgBus` debug session end to end
- exchange DAP events between the host page and the embedded debugger session

By default it uses the companion repo at `/projects/vscode-web-static`. You can
override that with:

```bash
VSCODE_REACT_COMPANION_DIR=/path/to/vscode-web-static npm run test:e2e
```

## Building

This package uses Babel to compile JSX and modern JavaScript for distribution.

```bash
npm run build
```

The compiled files will be placed in `dist/`.

## License

Apache-2.0
