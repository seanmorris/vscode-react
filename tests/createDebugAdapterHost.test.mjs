import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const loadHelper = async() => {
	const entry = await import(pathToFileURL(path.join(rootDir, 'dist', 'index.mjs')).href);
	return entry.createDebugAdapterHost;
};

test('createDebugAdapterHost drives a minimal DAP request flow', async() => {
	const createDebugAdapterHost = await loadHelper();
	const outboundMessages = [];
	const sessionEvents = [];

	const host = createDebugAdapterHost({
		onSessionEvent(type, session) {
			sessionEvents.push([type, session?.id ?? null]);
		},
		commands: {
			async initialize({ sendEvent }) {
				await sendEvent('initialized');
				return {
					supportsConfigurationDoneRequest: true
					, supportsStepInTargetsRequest: false
				};
			},

			launch() {
				return {};
			},

			setBreakpoints({ arguments: args }) {
				return {
					breakpoints: (args?.breakpoints ?? []).map(breakpoint => ({
						verified: true
						, line: breakpoint.line
					}))
				};
			},

			async configurationDone({ sendEvent }) {
				await sendEvent('stopped', {
					reason: 'entry'
					, threadId: 1
					, allThreadsStopped: true
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
						id: 1
						, name: 'main'
						, line: 1
						, column: 1
						, source: {
							name: 'demo.php'
							, path: '/workspace/demo.php'
						}
					}]
					, totalFrames: 1
				};
			},

			scopes() {
				return {
					scopes: [{
						name: 'Locals'
						, variablesReference: 0
						, expensive: false
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

	host.attachBridge({
		sendDebugAdapterMessage(sessionId, message) {
			outboundMessages.push([sessionId, message]);
			return true;
		}
	});

	const session = {
		id: 'session-1'
		, name: 'Example'
		, type: 'dbgBus'
		, configuration: {
			type: 'dbgBus'
			, request: 'launch'
			, name: 'Example'
		}
	};

	host.dbgHandlers.debugSessionStarted(session);
	host.dbgHandlers.didStartDebugSession(session);
	host.dbgHandlers.didChangeActiveDebugSession(session);

	assert.deepEqual(
		sessionEvents
		, [
			['debugSessionStarted', 'session-1']
			, ['didStartDebugSession', 'session-1']
			, ['didChangeActiveDebugSession', 'session-1']
		]
	);
	assert.equal(host.getActiveSession().id, 'session-1');
	assert.deepEqual(host.listSessions().map(session => session.id), ['session-1']);

	const initializeResponse = await host.dbgHandlers.acceptVSCodeMessage(session, {
		seq: 1
		, type: 'request'
		, command: 'initialize'
		, arguments: {
			clientID: 'vscode'
		}
	});

	assert.deepEqual(
		initializeResponse
		, {
			type: 'response'
			, seq: 2
			, request_seq: 1
			, command: 'initialize'
			, success: true
			, body: {
				supportsConfigurationDoneRequest: true
				, supportsStepInTargetsRequest: false
			}
		}
	);
	assert.deepEqual(
		outboundMessages.slice(0, 1)
		, [[
			'session-1'
			, {
				type: 'event'
				, seq: 1
				, event: 'initialized'
			}
		]]
	);

	const launchResponse = await host.dbgHandlers.acceptVSCodeMessage(session, {
		seq: 2
		, type: 'request'
		, command: 'launch'
		, arguments: {
			program: '/workspace/demo.php'
		}
	});

	assert.deepEqual(
		launchResponse
		, {
			type: 'response'
			, seq: 3
			, request_seq: 2
			, command: 'launch'
			, success: true
			, body: {}
		}
	);

	const setBreakpointsResponse = await host.dbgHandlers.acceptVSCodeMessage(session, {
		seq: 3
		, type: 'request'
		, command: 'setBreakpoints'
		, arguments: {
			source: { path: '/workspace/demo.php' }
			, breakpoints: [{ line: 4 }, { line: 8 }]
		}
	});

	assert.deepEqual(
		setBreakpointsResponse
		, {
			type: 'response'
			, seq: 4
			, request_seq: 3
			, command: 'setBreakpoints'
			, success: true
			, body: {
				breakpoints: [
					{ verified: true, line: 4 }
					, { verified: true, line: 8 }
				]
			}
		}
	);

	const configurationDoneResponse = await host.dbgHandlers.acceptVSCodeMessage(session, {
		seq: 4
		, type: 'request'
		, command: 'configurationDone'
	});

	assert.deepEqual(
		configurationDoneResponse
		, {
			type: 'response'
			, seq: 6
			, request_seq: 4
			, command: 'configurationDone'
			, success: true
			, body: {}
		}
	);
	assert.deepEqual(
		outboundMessages.slice(1, 2)
		, [[
			'session-1'
			, {
				type: 'event'
				, seq: 5
				, event: 'stopped'
				, body: {
					reason: 'entry'
					, threadId: 1
					, allThreadsStopped: true
				}
			}
		]]
	);

	const threadsResponse = await host.dbgHandlers.acceptVSCodeMessage(session, {
		seq: 5
		, type: 'request'
		, command: 'threads'
	});

	assert.deepEqual(
		threadsResponse
		, {
			type: 'response'
			, seq: 7
			, request_seq: 5
			, command: 'threads'
			, success: true
			, body: {
				threads: [{ id: 1, name: 'Main Thread' }]
			}
		}
	);

	const stackTraceResponse = await host.dbgHandlers.acceptVSCodeMessage(session, {
		seq: 6
		, type: 'request'
		, command: 'stackTrace'
	});

	assert.deepEqual(
		stackTraceResponse
		, {
			type: 'response'
			, seq: 8
			, request_seq: 6
			, command: 'stackTrace'
			, success: true
			, body: {
				stackFrames: [{
					id: 1
					, name: 'main'
					, line: 1
					, column: 1
					, source: {
						name: 'demo.php'
						, path: '/workspace/demo.php'
					}
				}]
				, totalFrames: 1
			}
		}
	);

	const continueResponse = await host.dbgHandlers.acceptVSCodeMessage(session, {
		seq: 7
		, type: 'request'
		, command: 'continue'
	});

	assert.deepEqual(
		continueResponse
		, {
			type: 'response'
			, seq: 9
			, request_seq: 7
			, command: 'continue'
			, success: true
			, body: {
				allThreadsContinued: true
			}
		}
	);

	const disconnectResponse = await host.dbgHandlers.acceptVSCodeMessage(session, {
		seq: 8
		, type: 'request'
		, command: 'disconnect'
	});

	assert.deepEqual(
		disconnectResponse
		, {
			type: 'response'
			, seq: 11
			, request_seq: 8
			, command: 'disconnect'
			, success: true
			, body: {}
		}
	);
	assert.deepEqual(
		outboundMessages.slice(2)
		, [[
			'session-1'
			, {
				type: 'event'
				, seq: 10
				, event: 'terminated'
			}
		]]
	);

	host.dbgHandlers.didTerminateDebugSession(session);
	assert.equal(host.getActiveSession(), null);
	assert.deepEqual(host.listSessions(), []);
});

test('createDebugAdapterHost returns explicit failures for unsupported or broken requests', async() => {
	const createDebugAdapterHost = await loadHelper();

	const host = createDebugAdapterHost({
		commands: {
			broken() {
				throw new Error('No runtime attached.');
			}
		}
	});

	host.dbgHandlers.debugSessionStarted({ id: 'session-2' });

	const unsupportedResponse = await host.dbgHandlers.acceptVSCodeMessage(
		{ id: 'session-2' }
		, {
			seq: 1
			, type: 'request'
			, command: 'evaluate'
		}
	);

	assert.deepEqual(
		unsupportedResponse
		, {
			type: 'response'
			, seq: 1
			, request_seq: 1
			, command: 'evaluate'
			, success: false
			, message: 'No DAP handler configured for "evaluate".'
			, body: {
				error: {
					id: 1
					, format: 'No DAP handler configured for "evaluate".'
				}
			}
		}
	);

	const brokenResponse = await host.dbgHandlers.acceptVSCodeMessage(
		{ id: 'session-2' }
		, {
			seq: 2
			, type: 'request'
			, command: 'broken'
		}
	);

	assert.deepEqual(
		brokenResponse
		, {
			type: 'response'
			, seq: 2
			, request_seq: 2
			, command: 'broken'
			, success: false
			, message: 'No runtime attached.'
			, body: {
				error: {
					id: 1
					, format: 'No runtime attached.'
				}
			}
		}
	);
});
