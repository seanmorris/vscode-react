import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createDebugAdapterHost, useVSCode } from '../../dist/index.mjs';

const filePath = '/workspace/demo.php';
const fileUri = `busfs://${filePath}`;
const fileContent = `<?php
echo "Hello from vscode-react";
`;
const fileBytes = Array.from(new TextEncoder().encode(fileContent));

const state = {
	calls: []
	, debugCommands: []
	, debugMessages: []
	, debugSessionEvents: []
	, ready: false
	, bridgeAttached: false
	, openFile: null
	, executeCommand: null
	, startDebugging: null
	, stopDebugging: null
	, addBreakpoint: null
	, listDebugSessions: null
	, listOpenBreakpoints: null
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
	const {
		VSCode
		, openFile
		, executeCommand
		, startDebugging
		, stopDebugging
		, sendDebugAdapterMessage
		, addBreakpoint
		, listDebugSessions
		, listOpenBreakpoints
	} = useVSCode({
		url: '/editor/'
		, fsHandlers: {
			activate(...args) {
				record('activate', ...args);
				return 'host-activated';
			}

			, async readFile(...args) {
				record('readFile', ...args);
				return args[0] === filePath ? fileBytes : [];
			}

			, readdir(...args) {
				record('readdir', ...args);
				if(args[0] === '/')
				{
					return ['workspace'];
				}

				if(args[0] === '/workspace')
				{
					return ['demo.php'];
				}

				return [];
			}

			, analyzePath(...args) {
				record('analyzePath', ...args);
				if(args[0] === '/')
				{
					return { exists: true, object: { isFolder: true } };
				}

				if(args[0] === '/workspace')
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

	useEffect(() => {
		debugHost.attachBridge({
			sendDebugAdapterMessage(sessionId, message) {
				recordDebugMessage(sessionId, message);
				return sendDebugAdapterMessage(sessionId, message);
			}
		});

		state.openFile = openFile;
		state.executeCommand = executeCommand;
		state.startDebugging = startDebugging;
		state.stopDebugging = stopDebugging;
		state.addBreakpoint = addBreakpoint;
		state.listDebugSessions = listDebugSessions;
		state.listOpenBreakpoints = listOpenBreakpoints;
		state.bridgeAttached = true;
		state.ready = true;
	}, [
		openFile
		, executeCommand
		, startDebugging
		, stopDebugging
		, sendDebugAdapterMessage
		, addBreakpoint
		, listDebugSessions
		, listOpenBreakpoints
	]);

	return React.createElement(VSCode, { className: 'editor-frame' });
}

createRoot(document.getElementById('root')).render(React.createElement(Harness));
