const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const modulePath = path.resolve(__dirname, '..', 'dist', 'useVSCode.js');

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
		openFile(path) {
			clientCalls.push(['openFile', path]);
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

test('useVSCode wires quickbus through the iframe bridge', () => {
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
		assert.equal(typeof bridge.VSCode, 'function');
		assert.equal(loaded.effects.length, 1);
		assert.equal(loaded.refs.length, 3);

		const iframe = { contentWindow: { tag: 'iframe-window' } };
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

		const rendered = bridge.VSCode({ className: 'editor-frame' });
		assert.equal(rendered.type, 'iframe');
		assert.equal(rendered.props.className, 'editor-frame');
		assert.equal(rendered.props.src, 'https://inner.example/editor?origin=https://outer.example');
		assert.equal(rendered.props.ref, loaded.refs[2]);

		bridge.openFile('/workspace/test.php');
		bridge.executeCommand('workbench.action.quickOpen', 'foo', 'bar');
		bridge.startDebugging({ type: 'dbgBus', request: 'launch', name: 'Example' }, { workspaceFolderUri: 'file:///workspace' });
		bridge.stopDebugging('session-1');
		bridge.sendDebugAdapterMessage('session-1', { seq: 1, type: 'request', command: 'initialize' });
		bridge.customRequest('session-1', 'threads', { foo: 'bar' });
		bridge.listDebugSessions();
		bridge.listBreakpoints();
		bridge.listOpenBreakpoints();
		bridge.addBreakpoint('file:///workspace/test.php', 12, 3);

		assert.deepEqual(
			loaded.clientCalls.slice(1)
			, [
				['openFile', '/workspace/test.php']
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

		const messageEvent = { data: { ok: true } };
		loaded.windowCalls.add[0][1](messageEvent);
		assert.deepEqual(loaded.serverInstances[0].events, [messageEvent]);

		assert.equal(typeof cleanup, 'function');
		cleanup();

		assert.deepEqual(loaded.windowCalls.remove, [['message', loaded.windowCalls.add[0][1]]]);
	}
	finally {
		loaded.restore();
	}
});

test('useVSCode provides a fallback debug adapter response when dbg handlers are omitted', () => {
	const loaded = loadHookModule();

	try {
		const bridge = loaded.useVSCode({
			url: 'https://inner.example/editor'
		});

		const iframe = { contentWindow: { tag: 'iframe-window' } };
		loaded.refs[2].current = iframe;
		loaded.effects[0]();

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

		assert.equal(bridge.startDebugging({ type: 'dbgBus', request: 'launch', name: 'Example' }), undefined);
	}
	finally {
		loaded.restore();
	}
});
