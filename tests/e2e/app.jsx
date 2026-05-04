import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createDebugAdapterHost, useVSCode } from '../../dist/index.mjs';

const READY_MESSAGE_KIND = 'vscode-react';
const READY_MESSAGE_TYPE = 'ready';
const filePath = '/preload/test_www/hello-world.php';
const fileUri = `busfs://${filePath}`;
const fileContent = `<?php
echo "Hello from /preload/test_www/hello-world.php";
`;
const fileBytes = Array.from(new TextEncoder().encode(fileContent));
const generatedFilesAssociations = {
	'*.module': 'php'
	, '*.inc': 'php'
};

const state = {
	calls: []
	, debugCommands: []
	, debugMessages: []
	, debugSessionEvents: []
	, ready: false
	, readyError: null
	, readySignals: 0
	, bridgeAttached: false
	, iframeLoads: 0
	, startupOpenResolved: false
	, startupOpenResult: null
	, startupOpenError: null
	, configureError: null
	, openFile: null
	, configure: null
	, executeCommand: null
	, startDebugging: null
	, stopDebugging: null
	, addBreakpoint: null
	, listDebugSessions: null
	, listOpenBreakpoints: null
	, runReloadQueueCheck: null
	, reloadCallResolved: false
	, reloadCallReadySignalsAtResolve: null
	, filePath
	, fileUri
	, fileContent
};

window.__vscodeReactE2E = state;

const record = (name, ...args) => {
	state.calls.push([name, ...args]);
};

const recordDebugCommand = (name, ...args) => {
	state.debugCommands.push([name, ...args]);
};

const recordDebugMessage = (sessionId, message) => {
	state.debugMessages.push([sessionId, message]);
};

const debugHost = createDebugAdapterHost({
	onSessionEvent(type, session) {
		state.debugSessionEvents.push([type, session?.id ?? null, session?.name ?? null]);
	},
	commands: {
		async initialize({ arguments: args, sendEvent }) {
			recordDebugCommand('initialize', args);
			await sendEvent('initialized');
			return {
				supportsConfigurationDoneRequest: true
				, supportsTerminateRequest: true
			};
		},

		launch({ arguments: args }) {
			recordDebugCommand('launch', args);
			return {};
		},

		setBreakpoints({ arguments: args }) {
			recordDebugCommand('setBreakpoints', args);
			return {
				breakpoints: (args?.breakpoints ?? []).map(breakpoint => ({
					verified: true
					, line: breakpoint.line
				}))
			};
		},

		async configurationDone({ sendEvent }) {
			recordDebugCommand('configurationDone');
			await sendEvent('stopped', {
				reason: 'entry'
				, threadId: 1
				, allThreadsStopped: true
			});
			return {};
		},

		threads() {
			recordDebugCommand('threads');
			return {
				threads: [{ id: 1, name: 'Main Thread' }]
			};
		},

		stackTrace() {
			recordDebugCommand('stackTrace');
			return {
				stackFrames: [{
					id: 1
					, name: 'main'
					, line: 2
					, column: 1
					, source: {
						name: 'demo.php'
						, path: filePath
					}
				}]
				, totalFrames: 1
			};
		},

		scopes() {
			recordDebugCommand('scopes');
			return {
				scopes: [{
					name: 'Locals'
					, variablesReference: 0
					, expensive: false
				}]
			};
		},

		continue() {
			recordDebugCommand('continue');
			return {
				allThreadsContinued: true
			};
		},

		async disconnect() {
			recordDebugCommand('disconnect');
			return {};
		},

		async terminate({ sendEvent }) {
			recordDebugCommand('terminate');
			await sendEvent('terminated');
			return {};
		}
	}
});

function Harness()
{
	const openFileRef = useRef(null);
	const configureRef = useRef(null);

	const {
		VSCode
		, openFile
		, configure
		, executeCommand
		, startDebugging
		, stopDebugging
		, sendDebugAdapterMessage
		, addBreakpoint
		, listDebugSessions
		, listOpenBreakpoints
		, ready
	} = useVSCode({
		url: '/editor/'
		, fsHandlers: {
			async activate(...args) {
				record('activate', ...args);

				const configurePromise = configureRef.current?.({
					filesAssociations: generatedFilesAssociations
				}).catch(error => {
					state.configureError = error?.message ?? String(error);
					return null;
				});

				const startupOpenPromise = openFileRef.current?.(filePath, {
					languageId: 'php'
				}).then(result => {
					state.startupOpenResolved = true;
					state.startupOpenResult = result;
					return result;
				}).catch(error => {
					state.startupOpenError = error?.message ?? String(error);
					throw error;
				});

				await Promise.all([configurePromise, startupOpenPromise]);

				return args.length ? args[0] : 'host-activated';
			}

			, async readFile(...args) {
				record('readFile', ...args);
				return args[0] === filePath ? fileBytes : [];
			}

			, readdir(...args) {
				record('readdir', ...args);
				if(args[0] === '/')
				{
					return ['preload'];
				}

				if(args[0] === '/preload')
				{
					return ['test_www'];
				}

				if(args[0] === '/preload/test_www')
				{
					return ['hello-world.php'];
				}

				return [];
			}

			, analyzePath(...args) {
				record('analyzePath', ...args);
				if(args[0] === '/')
				{
					return { exists: true, object: { isFolder: true } };
				}

				if(args[0] === '/preload')
				{
					return { exists: true, object: { isFolder: true } };
				}

				if(args[0] === '/preload/test_www')
				{
					return { exists: true, object: { isFolder: true } };
				}

				if(args[0] === filePath)
				{
					return { exists: true, object: { isFolder: false } };
				}

				return { exists: false, object: { isFolder: false } };
			}
			}
			, dbgHandlers: debugHost.dbgHandlers
		});

	openFileRef.current = openFile;
	configureRef.current = configure;

	useEffect(() => {
		const onMessage = event => {
			const iframeWindow = document.querySelector('iframe')?.contentWindow;
			const data = event?.data;

			if(
				event?.source === iframeWindow
				&& data
				&& typeof data === 'object'
				&& data.kind === READY_MESSAGE_KIND
				&& data.type === READY_MESSAGE_TYPE
			) {
				state.readySignals += 1;
			}
		};

		window.addEventListener('message', onMessage);

		return () => {
			window.removeEventListener('message', onMessage);
		};
	}, []);

	useEffect(() => {
		debugHost.attachBridge({
			sendDebugAdapterMessage(sessionId, message) {
				recordDebugMessage(sessionId, message);
				return sendDebugAdapterMessage(sessionId, message);
			}
		});

		state.openFile = openFile;
		state.configure = configure;
		state.executeCommand = executeCommand;
		state.startDebugging = startDebugging;
		state.stopDebugging = stopDebugging;
		state.addBreakpoint = addBreakpoint;
		state.listDebugSessions = listDebugSessions;
		state.listOpenBreakpoints = listOpenBreakpoints;
		state.bridgeAttached = true;
		ready.then(
			() => {
				state.ready = true;
			}
			, error => {
				state.readyError = error?.message ?? String(error);
			}
		);

		const iframe = document.querySelector('iframe');

		if(!iframe)
		{
			return;
		}

		const onLoad = () => {
			state.iframeLoads += 1;
		};

		iframe.addEventListener('load', onLoad);

		state.runReloadQueueCheck = () => {
			const readySignalsBeforeReload = state.readySignals;
			const iframeLoadsBeforeReload = state.iframeLoads;

			return new Promise((resolve, reject) => {
				const onReloadLoad = () => {
					iframe.removeEventListener('load', onReloadLoad);

					const readySignalsAtCallStart = state.readySignals;
					const iframeLoadsAtCallStart = state.iframeLoads;
					state.reloadCallResolved = false;
					state.reloadCallReadySignalsAtResolve = null;

					openFile(filePath).then(
						result => {
							state.reloadCallResolved = true;
							state.reloadCallReadySignalsAtResolve = state.readySignals;
							resolve({
								result
								, readySignalsBeforeReload
								, readySignalsAtCallStart
								, readySignalsAtResolve: state.readySignals
								, iframeLoadsBeforeReload
								, iframeLoadsAtCallStart
								, iframeLoadsAtResolve: state.iframeLoads
							});
						}
						, reject
					);
				};

				iframe.addEventListener('load', onReloadLoad);
				iframe.src = iframe.src;
			});
		};

		return () => {
			iframe.removeEventListener('load', onLoad);
			state.runReloadQueueCheck = null;
		};
	}, [
		openFile
		, configure
		, executeCommand
		, startDebugging
		, stopDebugging
		, sendDebugAdapterMessage
		, addBreakpoint
		, listDebugSessions
		, listOpenBreakpoints
		, ready
	]);

	return React.createElement(VSCode, { className: 'editor-frame' });
}

createRoot(document.getElementById('root')).render(React.createElement(Harness));
