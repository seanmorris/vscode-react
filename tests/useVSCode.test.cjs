const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const modulePath = path.resolve(__dirname, '..', 'dist', 'useVSCode.js');

const createMockIframe = () => {
	const listeners = new Map();
	const eventCalls = {
		add: []
		, remove: []
	};

	const iframe = {
		contentWindow: { tag: 'iframe-window' }

		, addEventListener(type, listener) {
			eventCalls.add.push([type, listener]);
			listeners.set(type, listener);
		}

		, removeEventListener(type, listener) {
			eventCalls.remove.push([type, listener]);

			if(listeners.get(type) === listener)
			{
				listeners.delete(type);
			}
		}

		, dispatch(type) {
			const listener = listeners.get(type);

			if(listener)
			{
				listener({ type, target: iframe });
			}
		}

		, eventCalls
	};

	return iframe;
};

const loadHookModule = () => {
	const refs = [];
	const effects = [];
	const clientCalls = [];
	const serverInstances = [];
	const windowCalls = {
		add: []
		, remove: []
	};

	const client = {
		openFile(path, options = {}) {
			clientCalls.push(['openFile', path, options]);
		}

		, configure(options = {}) {
			clientCalls.push(['configure', options]);
		}

		, executeCommand(...args) {
			clientCalls.push(['executeCommand', ...args]);
		}

		, startDebugging(...args) {
			clientCalls.push(['startDebugging', ...args]);
		}

		, stopDebugging(...args) {
			clientCalls.push(['stopDebugging', ...args]);
		}

		, sendDebugAdapterMessage(...args) {
			clientCalls.push(['sendDebugAdapterMessage', ...args]);
		}

		, customRequest(...args) {
			clientCalls.push(['customRequest', ...args]);
		}

		, listDebugSessions(...args) {
			clientCalls.push(['listDebugSessions', ...args]);
		}

		, listBreakpoints(...args) {
			clientCalls.push(['listBreakpoints', ...args]);
		}

		, listOpenBreakpoints(...args) {
			clientCalls.push(['listOpenBreakpoints', ...args]);
		}

		, addBreakpoint(...args) {
			clientCalls.push(['addBreakpoint', ...args]);
		}
	};

	const quickbus = {
		Client: {
			forIframe(iframe, origin) {
				clientCalls.push(['forIframe', iframe, origin]);
				return client;
			}
		}

		, Server: class Server {
			constructor(handlers, ...origins) {
				this.handlers = handlers;
				this.origins = origins;
				this.events = [];
				serverInstances.push(this);
			}

			handleMessageEvent(event) {
				this.events.push(event);
			}
		}
	};

	const react = {
		useRef(initialValue) {
			const ref = { current: initialValue };
			refs.push(ref);
			return ref;
		}

		, useEffect(effect) {
			effects.push(effect);
		}
	};

	const jsxRuntime = {
		jsx(type, props) {
			return { type, props };
		}
	};

	const originalWindow = global.window;
	const originalLoad = Module._load;

	global.window = {
		location: { origin: 'https://outer.example' }

		, addEventListener(type, listener) {
			windowCalls.add.push([type, listener]);
		}

		, removeEventListener(type, listener) {
			windowCalls.remove.push([type, listener]);
		}
	};

	Module._load = function(request, parent, isMain) {
		if (request === 'quickbus') {
			return quickbus;
		}

		if (request === 'react') {
			return react;
		}

		if (request === 'react/jsx-runtime') {
			return jsxRuntime;
		}

		return originalLoad.call(this, request, parent, isMain);
	};

	delete require.cache[modulePath];

	try {
		const loaded = require(modulePath);

		return {
			useVSCode: loaded.useVSCode
			, refs
			, effects
			, clientCalls
			, serverInstances
			, windowCalls
			, restore() {
				Module._load = originalLoad;

				if (originalWindow === undefined) {
					delete global.window;
				}
				else {
					global.window = originalWindow;
				}
			}
		};
	}
	catch(error) {
		Module._load = originalLoad;

		if (originalWindow === undefined) {
			delete global.window;
		}
		else {
			global.window = originalWindow;
		}

		throw error;
	}
};

test('useVSCode wires quickbus through the iframe bridge after the iframe signals readiness', async () => {
	const loaded = loadHookModule();

	try {
		const fsHandlers = {
			readFile() {
				return [1, 2, 3];
			}
		};

		const dbgHandlers = {
			acceptVSCodeMessage() {
				return { ok: true };
			}
		};

		const bridge = loaded.useVSCode({
			url: 'https://inner.example/editor'
			, fsHandlers
			, dbgHandlers
		});

		assert.equal(typeof bridge.openFile, 'function');
		assert.equal(typeof bridge.executeCommand, 'function');
		assert.equal(typeof bridge.startDebugging, 'function');
		assert.equal(typeof bridge.stopDebugging, 'function');
		assert.equal(typeof bridge.sendDebugAdapterMessage, 'function');
		assert.equal(typeof bridge.customRequest, 'function');
		assert.equal(typeof bridge.listDebugSessions, 'function');
		assert.equal(typeof bridge.listBreakpoints, 'function');
		assert.equal(typeof bridge.listOpenBreakpoints, 'function');
		assert.equal(typeof bridge.addBreakpoint, 'function');
		assert.equal(typeof bridge.ready?.then, 'function');
		assert.equal(typeof bridge.VSCode, 'function');
		assert.equal(typeof bridge.configure, 'function');
		assert.equal(loaded.effects.length, 1);
		assert.equal(loaded.refs.length, 5);

		const iframe = createMockIframe();
		loaded.refs[2].current = iframe;

		const cleanup = loaded.effects[0]();

		assert.deepEqual(
			loaded.clientCalls[0]
			, ['forIframe', iframe, 'https://inner.example']
		);

		assert.equal(loaded.serverInstances.length, 1);
		assert.deepEqual(loaded.serverInstances[0].origins, ['https://inner.example']);
		assert.equal(loaded.serverInstances[0].handlers.readFile, fsHandlers.readFile);
		assert.equal(loaded.serverInstances[0].handlers.acceptVSCodeMessage, dbgHandlers.acceptVSCodeMessage);
		assert.equal(loaded.windowCalls.add.length, 1);
		assert.equal(loaded.windowCalls.add[0][0], 'message');
		assert.equal(iframe.eventCalls.add.length, 1);
		assert.equal(iframe.eventCalls.add[0][0], 'load');

		const rendered = bridge.VSCode({ className: 'editor-frame' });
		assert.equal(rendered.type, 'iframe');
		assert.equal(rendered.props.className, 'editor-frame');
		assert.equal(new URL(rendered.props.src).searchParams.get('origin'), 'https://outer.example');
		assert.equal(rendered.props.ref, loaded.refs[2]);

		const openFilePromise = bridge.openFile('/workspace/test.php', { languageId: 'php' });
		assert.deepEqual(loaded.clientCalls, [['forIframe', iframe, 'https://inner.example']]);

		const messageEvent = { data: { ok: true } };
		loaded.windowCalls.add[0][1](messageEvent);
		assert.deepEqual(loaded.serverInstances[0].events, [messageEvent]);

		const readyEvent = {
			data: {
				kind: 'vscode-react'
				, type: 'ready'
			}
			, origin: 'https://inner.example'
			, source: iframe.contentWindow
		};

		loaded.windowCalls.add[0][1](readyEvent);
		assert.deepEqual(await bridge.ready, readyEvent.data);
		await openFilePromise;
		await bridge.configure({ filesAssociations: { '*.inc': 'php' } });

		await bridge.executeCommand('workbench.action.quickOpen', 'foo', 'bar');
		await bridge.startDebugging({ type: 'dbgBus', request: 'launch', name: 'Example' }, { workspaceFolderUri: 'file:///workspace' });
		await bridge.stopDebugging('session-1');
		await bridge.sendDebugAdapterMessage('session-1', { seq: 1, type: 'request', command: 'initialize' });
		await bridge.customRequest('session-1', 'threads', { foo: 'bar' });
		await bridge.listDebugSessions();
		await bridge.listBreakpoints();
		await bridge.listOpenBreakpoints();
		await bridge.addBreakpoint('file:///workspace/test.php', 12, 3);

		assert.deepEqual(
			loaded.clientCalls.slice(1)
			, [
				['openFile', '/workspace/test.php', { languageId: 'php' }]
				, ['configure', { filesAssociations: { '*.inc': 'php' } }]
				, ['executeCommand', 'workbench.action.quickOpen', 'foo', 'bar']
				, ['startDebugging', { type: 'dbgBus', request: 'launch', name: 'Example' }, { workspaceFolderUri: 'file:///workspace' }]
				, ['stopDebugging', 'session-1']
				, ['sendDebugAdapterMessage', 'session-1', { seq: 1, type: 'request', command: 'initialize' }]
				, ['customRequest', 'session-1', 'threads', { foo: 'bar' }]
				, ['listDebugSessions']
				, ['listBreakpoints']
				, ['listOpenBreakpoints']
				, ['addBreakpoint', 'file:///workspace/test.php', 12, 3]
			]
		);

		assert.equal(typeof cleanup, 'function');
		cleanup();

		assert.deepEqual(loaded.windowCalls.remove, [['message', loaded.windowCalls.add[0][1]]]);
		assert.equal(iframe.eventCalls.remove.length, 1);
		assert.equal(iframe.eventCalls.remove[0][0], 'load');
	}
	finally {
		loaded.restore();
	}
});

test('useVSCode provides a fallback debug adapter response when dbg handlers are omitted', async () => {
	const loaded = loadHookModule();

	try {
		const bridge = loaded.useVSCode({
			url: 'https://inner.example/editor'
		});

		const iframe = createMockIframe();
		loaded.refs[2].current = iframe;
		loaded.effects[0]();
		loaded.windowCalls.add[0][1]({
			data: {
				kind: 'vscode-react'
				, type: 'ready'
			}
			, origin: 'https://inner.example'
			, source: iframe.contentWindow
		});

		const response = loaded.serverInstances[0].handlers.acceptVSCodeMessage(
			{ id: 'session-1' }
			, { type: 'request', seq: 7, command: 'initialize' }
		);

		assert.deepEqual(
			response
			, {
				type: 'response'
				, seq: 1
				, request_seq: 7
				, command: 'initialize'
				, success: false
				, message: 'No host debug adapter configured.'
				, body: {
					error: {
						id: 1
						, format: 'No host debug adapter configured.'
					}
				}
				}
			);

		assert.equal(await bridge.startDebugging({ type: 'dbgBus', request: 'launch', name: 'Example' }), undefined);
	}
	finally {
		loaded.restore();
	}
});

test('useVSCode re-arms bridge calls after the iframe loads again without replacing the public ready promise', async () => {
	const loaded = loadHookModule();

	try {
		const bridge = loaded.useVSCode({
			url: 'https://inner.example/editor'
		});

		const iframe = createMockIframe();
		loaded.refs[2].current = iframe;
		loaded.effects[0]();

		const firstReadyEvent = {
			data: {
				kind: 'vscode-react'
				, type: 'ready'
				, boot: 'first'
			}
			, origin: 'https://inner.example'
			, source: iframe.contentWindow
		};

		loaded.windowCalls.add[0][1](firstReadyEvent);
		assert.deepEqual(await bridge.ready, firstReadyEvent.data);

		iframe.dispatch('load');

		const reloadedOpenFile = bridge.openFile('/workspace/reloaded.php', { languageId: 'php' });

		assert.deepEqual(
			loaded.clientCalls
			, [['forIframe', iframe, 'https://inner.example']]
		);

		const secondReadyEvent = {
			data: {
				kind: 'vscode-react'
				, type: 'ready'
				, boot: 'second'
			}
			, origin: 'https://inner.example'
			, source: iframe.contentWindow
		};

		loaded.windowCalls.add[0][1](secondReadyEvent);
		await reloadedOpenFile;

		assert.deepEqual(await bridge.ready, firstReadyEvent.data);
		assert.deepEqual(
			loaded.clientCalls.slice(1)
			, [['openFile', '/workspace/reloaded.php', { languageId: 'php' }]]
		);
	}
	finally {
		loaded.restore();
	}
});

test('useVSCode keeps the public ready promise usable across a StrictMode-style effect replay', async () => {
	const loaded = loadHookModule();

	try {
		const bridge = loaded.useVSCode({
			url: 'https://inner.example/editor'
		});

		const iframe = createMockIframe();
		loaded.refs[2].current = iframe;

		const cleanup = loaded.effects[0]();
		cleanup();
		loaded.effects[0]();

		await new Promise(resolve => setTimeout(resolve, 0));

		const readyEvent = {
			data: {
				kind: 'vscode-react'
				, type: 'ready'
				, boot: 'strict-mode'
			}
			, origin: 'https://inner.example'
			, source: iframe.contentWindow
		};

		const openFilePromise = bridge.openFile('/workspace/strict-mode.php');
		loaded.windowCalls.add[loaded.windowCalls.add.length - 1][1](readyEvent);

		assert.deepEqual(await bridge.ready, readyEvent.data);
		await openFilePromise;

		assert.equal(
			loaded.clientCalls.filter(([name]) => name === 'forIframe').length
			, 2
		);
		assert.deepEqual(
			loaded.clientCalls[loaded.clientCalls.length - 1]
			, ['openFile', '/workspace/strict-mode.php', {}]
		);
	}
	finally {
		loaded.restore();
	}
});

test('useVSCode supports an opt-in ready timeout', async () => {
	const loaded = loadHookModule();

	try {
		const bridge = loaded.useVSCode({
			url: 'https://inner.example/editor'
			, readyTimeoutMs: 1
		});

		const iframe = createMockIframe();
		loaded.refs[2].current = iframe;
		loaded.effects[0]();

		await assert.rejects(
			bridge.openFile('/workspace/test.php')
			, error => error?.code === 'VSCODE_BRIDGE_READY_TIMEOUT'
		);
	}
	finally {
		loaded.restore();
	}
});

test('useVSCode applies readyTimeoutMs to a re-armed iframe load epoch without changing the public ready result', async () => {
	const loaded = loadHookModule();

	try {
		const bridge = loaded.useVSCode({
			url: 'https://inner.example/editor'
			, readyTimeoutMs: 1
		});

		const iframe = createMockIframe();
		loaded.refs[2].current = iframe;
		loaded.effects[0]();

		const firstReadyEvent = {
			data: {
				kind: 'vscode-react'
				, type: 'ready'
				, boot: 'first'
			}
			, origin: 'https://inner.example'
			, source: iframe.contentWindow
		};

		loaded.windowCalls.add[0][1](firstReadyEvent);
		assert.deepEqual(await bridge.ready, firstReadyEvent.data);

		iframe.dispatch('load');

		await assert.rejects(
			bridge.executeCommand('workbench.action.quickOpen')
			, error => error?.code === 'VSCODE_BRIDGE_READY_TIMEOUT'
		);

		assert.deepEqual(await bridge.ready, firstReadyEvent.data);
	}
	finally {
		loaded.restore();
	}
});
