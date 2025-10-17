# vscode-react

> A React hook for embedding the VSCode editor via an iframe and [quickbus](https://github.com/seanmorris/quickbus).
>
> You can build & host your own instance of VSCode with [vscode-static-web](https://github.com/seanmorris/vscode-static-web).

## Installation

```bash
npm install vscode-react
```

## Usage

```jsx
import React from 'react';
import { useVSCode } from 'vscode-react';

function App() {
  const fsHandlers = {
    // Provide your custom file system handlers here
  };

  const { VSCode, openFile, executeCommand } = useVSCode({
    url: 'https://oss-code.pages.dev',
    fsHandlers,
  });

  // You can call openFile('/path/to/file') or executeCommand('workbench.action.files.newUntitledFile') as needed.

  return <VSCode className="editor" />;
}

export default App;
```

## Hook API

This hook uses [quickbus](https://github.com/seanmorris/quickbus) under the hood to bridge messages between your app and the VSCode iframe.

`useVSCode(options)`

| Option     | Type     | Description                           |
| ---------- | -------- | --------------------------------------|
| url        | string   | Base URL of the VSCode editor server. |
| fsHandlers | object   | Custom file-system handler callbacks. |

### Returned values

| Return           | Type                                              | Description                                  |
| ---------------- | ------------------------------------------------- | -------------------------------------------- |
| `VSCode`         | React component                                   | The iframe-based VSCode component to render. |
| `openFile`       | `(path: string) => void`                          | Opens the given file in the VSCode editor.   |
| `executeCommand` | `(command: string, ...args: any[]) => void`       | Executes a VS Code command in the editor.    |

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

The `fsHandlers` option lets you override the file-system callbacks. The API is geared toward interacting with the [Emscripten Filesystem API](https://emscripten.org/docs/api_reference/Filesystem-API.html). By default, this hook uses the following stub handlers:

```js
const defaultFsHandlers = {
  readdir(path: string, opts?: object): string[],
  async readFile(path: string, opts?: object): number[],
  analyzePath(path: string): { exists: boolean, isFile?: boolean, isDir?: boolean },
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
| `analyzePath`| `(path: string) => { exists: boolean, isFile?: boolean, isDir?: boolean }` | Checks if the path exists and whether it is a file or directory.                            |
| `writeFile`  | `(path: string, data: number[]) => void`                                   | Writes raw bytes to a file (data should be an array of numbers representing bytes).         |
| `rename`     | `(oldPath: string, newPath: string) => void`                               | Renames or moves a file or directory.                                                       |
| `mkdir`      | `(path: string, opts?: { recursive?: boolean }) => void`                   | Creates a directory. Use `opts.recursive` to create nested directories if needed.           |
| `unlink`     | `(path: string) => void`                                                   | Removes a file.                                                                             |
| `rmdir`      | `(path: string) => void`                                                   | Removes a (empty) directory.                                                                |
| `activate`   | `() => void`                                                               | Called when the FS bridge is activated (e.g., after initial mount).                         |

## Building

This package uses Babel to compile JSX and modern JavaScript for distribution.

```bash
npm run build
```

The compiled files will be placed in `dist/`.

## License

Apache-2.0