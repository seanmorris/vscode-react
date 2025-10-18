# vscode-react

vscode-react embeds the VSCode editor right in your React application. Uses [quickbus](https://github.com/seanmorris/quickbus) for IPC & filesystem access.

You can build & host your own static instance of VSCode with [vscode-static-web](https://github.com/seanmorris/vscode-static-web). You'll need the [file-bus](https://github.com/seanmorris/file-bus) extension added under `extra_extensions/`.

## Installation

```bash
npm install vscode-react
```

> ### I am giving up my bed for one night.
> My Sleep Out helps youth facing homelessness find safe shelter and loving care at Covenant House. That care includes essential services like education, job training, medical care, mental health and substance use counseling, and legal aid — everything they need to build independent, sustainable futures.
>
> By supporting my Sleep Out, you are supporting the dreams of young people overcoming homelessness.
>
> <a href = "https://www.sleepout.org/participants/62915"><img width = "50%" alt="Donate to Covenant House" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fwww.sleepout.org%2Fapi%2F1.3%2Fparticipants%2F62915%3F_%3D1760039017428&query=%24.sumDonations&prefix=%24&suffix=%20Raised&style=for-the-badge&label=Sleep%20Out%3A%20NYC&link=https%3A%2F%2Fwww.sleepout.org%2Fparticipants%2F62915"></a>
>
> Click here to help out: https://www.sleepout.org/participants/62915
>
> More info: https://www.sleepout.org/ | https://www.covenanthouse.org/ | https://www.charitynavigator.org/ein/132725416
>
> Together, we are working towards a future where every young person has a safe place to sleep.
>
> Thank you.
>
> *and now back to your documentation...*

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