import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cp, mkdir, opendir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');
const esmTempDir = path.join(rootDir, '.dist-esm');
const babelBin = path.join(rootDir, 'node_modules', '.bin', 'babel');

const runBabel = (envName, outDir) => {
	execFileSync(
		babelBin
		, [srcDir, '--out-dir', outDir, '--extensions', '.js,.jsx']
		, {
			cwd: rootDir
			, env: { ...process.env, BABEL_ENV: envName }
			, stdio: 'inherit'
		}
	);
};

const rewriteRelativeSpecifiers = source => source.replace(
	/(from\s+['"])(\.{1,2}\/[^'".]+)(['"])/g
	, '$1$2.mjs$3'
);

const moveEsmArtifacts = async(sourceDir, targetDir) => {
	const directory = await opendir(sourceDir);

	for await (const entry of directory)
	{
		const sourcePath = path.join(sourceDir, entry.name);

		if (entry.isDirectory())
		{
			const nestedTarget = path.join(targetDir, entry.name);
			await mkdir(nestedTarget, { recursive: true });
			await moveEsmArtifacts(sourcePath, nestedTarget);
			continue;
		}

		if (!entry.isFile())
		{
			continue;
		}

		const targetName = entry.name.endsWith('.js')
			? entry.name.replace(/\.js$/u, '.mjs')
			: entry.name;

		const targetPath = path.join(targetDir, targetName);

		if (entry.name.endsWith('.js'))
		{
			const source = readFileSync(sourcePath, 'utf8');
			writeFileSync(targetPath, rewriteRelativeSpecifiers(source));
			continue;
		}

		await cp(sourcePath, targetPath);
	}
};

rmSync(distDir, { recursive: true, force: true });
rmSync(esmTempDir, { recursive: true, force: true });

runBabel('cjs', distDir);
runBabel('esm', esmTempDir);
await moveEsmArtifacts(esmTempDir, distDir);
await rm(esmTempDir, { recursive: true, force: true });
