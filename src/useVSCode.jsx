import { Client, Server } from 'quickbus';
import { useEffect, useRef } from 'react';

const defaultFsHandlers = {
	readdir(...args) {
		console.log('readdir', ...args);
		return [];
	},

	async readFile(...args) {
		console.log('readFile', ...args);
	},

	analyzePath(...args) {
		console.log('analyzePath', ...args);
		return {
			exists: false
			, object: { isFolder: false }
		};
	},

	writeFile(path, content) {
		console.log('writeFile', path, content);
	},

	rename(...args) {
		console.log('rename', ...args);
	},

	mkdir: (...args) => {
		console.log('mkdir', ...args);
	},

	unlink: (...args) => {
		console.log('unlink', ...args);
	},

	rmdir: (...args) => {
		console.log('rmdir', ...args);
	},

	activate: (...args) => {
		console.log('activate', ...args)
	},
};

let fallbackDebugMessageSeq = 1;

const createMissingDebugAdapterResponse = message => {
	if(!message || message.type !== 'request')
	{
		return;
	}

	return {
		type: 'response'
		, seq: fallbackDebugMessageSeq++
		, request_seq: typeof message.seq === 'number' ? message.seq : 0
		, command: typeof message.command === 'string' ? message.command : ''
		, success: false
		, message: 'No host debug adapter configured.'
		, body: {
			error: {
				id: 1
				, format: 'No host debug adapter configured.'
			}
		}
	};
};

const defaultDbgHandlers = {
	acceptVSCodeMessage(session, message) {
		return createMissingDebugAdapterResponse(message);
	}

	, debugSessionStarted() {
		return;
	}

	, didStartDebugSession() {
		return;
	}

	, didTerminateDebugSession() {
		return;
	}

	, didChangeActiveDebugSession() {
		return;
	}
};

export const useVSCode = ({url, fsHandlers = {}, dbgHandlers = {}}) => {

	const outerUrl = window.location;
	const outerOrigin = outerUrl.origin;

	const innerUrl = new URL(url, outerOrigin);
	const innerOrigin = innerUrl.origin;

	const serverRef = useRef();
	const clientRef = useRef();
	const iframeRef = useRef();

	useEffect(() => {
		if (!iframeRef.current) return;

		clientRef.current = Client.forIframe(iframeRef.current, innerOrigin);

		if (!serverRef.current) {
			const handlers = {
				...defaultFsHandlers
				, ...defaultDbgHandlers
				, ...fsHandlers
				, ...dbgHandlers
			};
			serverRef.current = new Server(handlers, innerOrigin);
		}

		const onMsg = event => serverRef.current.handleMessageEvent(event);

		window.addEventListener('message', onMsg);

		return () => window.removeEventListener('message', onMsg);
	}, []);

	const VSCode = ({className = ''}) => {
		if (typeof window === 'undefined') return null;
		return (
			<iframe
				allow="clipboard-read; clipboard-write"
				className={className}
				src = {innerUrl.href + "?origin=" + outerOrigin}
				ref = {iframeRef}
			></iframe>
		);
	};

	const callClient = (method, ...args) => {
		if(!clientRef.current) {
			console.warn('VSCode is not ready yet.');
			return;
		}

		return clientRef.current[method](...args);
	};

	const openFile = path => {
		return callClient('openFile', path);
	};

	const executeCommand = (command, ...args) => {
		return callClient('executeCommand', command, ...args);
	};

	const startDebugging = (configuration, options = {}) => {
		return callClient('startDebugging', configuration, options);
	};

	const stopDebugging = sessionId => {
		return callClient('stopDebugging', sessionId);
	};

	const sendDebugAdapterMessage = (sessionId, message) => {
		return callClient('sendDebugAdapterMessage', sessionId, message);
	};

	const customRequest = (sessionId, command, args) => {
		return callClient('customRequest', sessionId, command, args);
	};

	const listDebugSessions = () => {
		return callClient('listDebugSessions');
	};

	const listBreakpoints = () => {
		return callClient('listBreakpoints');
	};

	const listOpenBreakpoints = () => {
		return callClient('listOpenBreakpoints');
	};

	const addBreakpoint = (uri, line, column = 1) => {
		return callClient('addBreakpoint', uri, line, column);
	};

	return {
		VSCode
		, openFile
		, executeCommand
		, startDebugging
		, stopDebugging
		, sendDebugAdapterMessage
		, customRequest
		, listDebugSessions
		, listBreakpoints
		, listOpenBreakpoints
		, addBreakpoint
	};
};
