import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const port = Number(process.argv[2]);
const pageUrl = process.argv[3];
const timeoutMs = Number(process.argv[4] || 30000);

async function fetchJson(path)
{
	const response = await fetch(`http://127.0.0.1:${port}${path}`);

	if(!response.ok)
	{
		throw new Error(`Failed to fetch ${path}: ${response.status}`);
	}

	return response.json();
}

async function waitForTarget()
{
	const deadline = Date.now() + timeoutMs;

	while(Date.now() < deadline)
	{
		const targets = await fetchJson('/json/list');
		const target = targets.find(candidate => candidate.type === 'page' && candidate.url.startsWith(pageUrl));

		if(target)
		{
			return target;
		}

		await delay(250);
	}

	throw new Error(`Timed out waiting for target ${pageUrl}`);
}

async function main()
{
	const target = await waitForTarget();
	const socket = new WebSocket(target.webSocketDebuggerUrl);
	const pending = new Map;
	let nextId = 0;

	const send = (method, params = {}) => {
		const id = ++nextId;
		socket.send(JSON.stringify({ id, method, params }));

		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
		});
	};

	socket.addEventListener('message', event => {
		const payload = JSON.parse(event.data);

		if(!payload.id)
		{
			return;
		}

		const deferred = pending.get(payload.id);

		if(!deferred)
		{
			return;
		}

		pending.delete(payload.id);

		if(payload.error)
		{
			deferred.reject(new Error(payload.error.message || `CDP error for ${payload.id}`));
			return;
		}

		deferred.resolve(payload.result);
	});

	await new Promise((resolve, reject) => {
		socket.addEventListener('open', resolve, { once: true });
		socket.addEventListener('error', reject, { once: true });
	});

	await send('Runtime.enable');
	await send('Page.enable');

	const waitForValue = async(expression) => {
		const deadline = Date.now() + timeoutMs;

		while(Date.now() < deadline)
		{
			const result = await send('Runtime.evaluate', {
				expression
				, returnByValue: true
				, awaitPromise: true
			});

			if(result.result?.value)
			{
				return;
			}

			await delay(250);
		}

		throw new Error(`Timed out waiting for expression: ${expression}`);
	};

	await waitForValue(`Boolean(
		window.__vscodeReactE2E
		&& window.__vscodeReactE2E.ready
		&& document.querySelector('iframe')
		&& document.querySelector('iframe').contentWindow
		&& document.querySelector('iframe').contentWindow.vscodeEditor
		&& document.querySelector('iframe').contentWindow.vscodeEditor.commands
		&& document.querySelector('iframe').contentWindow.document.querySelector('.monaco-workbench')
	)`);

	const initialResult = await send('Runtime.evaluate', {
		expression: `(() => {
			const iframe = document.querySelector('iframe');
			return {
				origin: location.origin,
				iframeSrc: iframe?.src,
				calls: window.__vscodeReactE2E.calls,
				filePath: window.__vscodeReactE2E.filePath,
				fileContent: window.__vscodeReactE2E.fileContent,
				hasWorkbench: Boolean(iframe?.contentWindow?.document?.querySelector('.monaco-workbench')),
				hasEditorApi: Boolean(iframe?.contentWindow?.vscodeEditor?.commands)
			};
		})()`
		, returnByValue: true
		, awaitPromise: true
	});

	const initial = initialResult.result?.value;

	assert.equal(initial.origin, pageUrl.replace(/\/app\.html$/u, ''));
	assert.match(initial.iframeSrc, /\/editor\/\?origin=/u);
	assert.equal(initial.hasWorkbench, true);
	assert.equal(initial.hasEditorApi, true);

	await send('Runtime.evaluate', {
		expression: `(() => {
			window.__vscodeReactE2E.openFile(window.__vscodeReactE2E.filePath);
			return true;
		})()`
		, returnByValue: true
		, awaitPromise: true
	});

	await waitForValue(`Boolean(
		window.__vscodeReactE2E.calls.some(call => call[0] === 'readFile' && call[1] === window.__vscodeReactE2E.filePath)
		&& document.querySelector('iframe')
		&& document.querySelector('iframe').contentWindow
		&& Array.from(
			document.querySelector('iframe').contentWindow.document.querySelectorAll('.tabs-container .label-name')
		).some(node => node.textContent === 'demo.php')
	)`);

	await send('Runtime.evaluate', {
		expression: `(() => {
			window.__vscodeReactE2E.executeCommand('workbench.action.quickOpen');
			return true;
		})()`
		, returnByValue: true
		, awaitPromise: true
	});

	await waitForValue(`Boolean(
		document.querySelector('iframe')
		&& document.querySelector('iframe').contentWindow
		&& document.querySelector('iframe').contentWindow.document.querySelector('.quick-input-widget')
	)`);

	const finalResult = await send('Runtime.evaluate', {
		expression: `(() => {
			const iframe = document.querySelector('iframe');
			const doc = iframe.contentWindow.document;
			return {
				calls: window.__vscodeReactE2E.calls,
				tabs: [...doc.querySelectorAll('.tabs-container .label-name')].map(node => node.textContent),
				breadcrumbs: [...doc.querySelectorAll('.breadcrumbs-below-tabs .monaco-breadcrumb-item .label-name')].map(node => node.textContent),
				editorText: [...doc.querySelectorAll('.view-lines span')].map(node => node.textContent).join(''),
				quickInputVisible: Boolean(doc.querySelector('.quick-input-widget'))
			};
		})()`
		, returnByValue: true
		, awaitPromise: true
	});

	const final = finalResult.result?.value;

	assert.equal(final.quickInputVisible, true);
	assert.equal(final.tabs.includes('demo.php'), true);
	assert.equal(final.breadcrumbs.includes('demo.php'), true);
	assert.match(final.editorText, /vscode-react/u);
	assert.equal(final.calls.some(call => call[0] === 'activate'), true);
	assert.equal(final.calls.some(call => call[0] === 'analyzePath' && call[1] === initial.filePath), true);
	assert.equal(final.calls.some(call => call[0] === 'readFile' && call[1] === initial.filePath), true);

	socket.close();
}

main().catch(error => {
	console.error(error.stack || error.message);
	process.exit(1);
});
