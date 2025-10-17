# vscode-react

> A React component for embedding the VSCode editor via an iframe and Quickbus.

## Installation

```bash
npm install vscode-react
```

## Usage

```jsx
import VSCode from 'vscode-react';

function App() {
  const fsHandlers = {
    // Provide your custom file system handlers here
  };

  return (
    <VSCode
      url="http://localhost:8080"
      fsHandlers={fsHandlers}
    />
  );
}

export default App;
```

## API

| Prop       | Type   | Description                           |
| ---------- | ------ | --------------------------------------|
| url        | string | Base URL of the VSCode editor server. |
| fsHandlers | object | Custom file-system handler callbacks. |

## File System Handlers

The `fsHandlers` prop lets you override the file-system callbacks following the [Emscripten Filesystem API](https://emscripten.org/docs/api_reference/Filesystem-API.html). By default, `VSCode` uses the following stub handlers:

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