import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const outDir = process.argv[2];

if(!outDir)
{
	throw new Error('Expected an output directory argument.');
}

await mkdir(outDir, { recursive: true });

await build({
	entryPoints: [path.join(__dirname, 'app.jsx')]
	, outfile: path.join(outDir, 'app.js')
	, bundle: true
	, format: 'iife'
	, platform: 'browser'
	, target: ['chrome120']
	, sourcemap: 'inline'
	, define: {
		'process.env.NODE_ENV': '"test"'
	}
	, absWorkingDir: rootDir
});

await writeFile(
	path.join(outDir, 'app.html')
	, `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>vscode-react e2e</title>
	</head>
	<body>
		<div id="root"></div>
		<script src="./app.js"></script>
	</body>
</html>
`
);
