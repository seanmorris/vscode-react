import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const packageJson = require(path.join(rootDir, 'package.json'));

test('package metadata exposes dual cjs and esm entrypoints', () => {
	assert.equal(packageJson.main, './dist/index.js');
	assert.equal(packageJson.module, './dist/index.mjs');
	assert.deepEqual(
		packageJson.exports
		, {
			'.': {
				import: './dist/index.mjs'
				, require: './dist/index.js'
			}
		}
	);
});

test('commonjs entry exports useVSCode', () => {
	const entry = require(path.join(rootDir, 'dist', 'index.js'));
	assert.equal(typeof entry.useVSCode, 'function');
});

test('esm entry exports useVSCode', async() => {
	const entry = await import(pathToFileURL(path.join(rootDir, 'dist', 'index.mjs')).href);
	assert.equal(typeof entry.useVSCode, 'function');
});
