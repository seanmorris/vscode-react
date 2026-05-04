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
const READY_MESSAGE_KIND = 'vscode-react';
const READY_MESSAGE_TYPE = 'ready';
const DEFAULT_READY_TIMEOUT_MS = 0;

const createDeferred = () => {
	let resolve;
	let reject;
	const promise = new Promise((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});

	return { promise, resolve, reject };
};

const createBridgeReadyTimeoutError = timeoutMs => {
	const error = new Error(`Timed out waiting ${timeoutMs}ms for the embedded VS Code host to signal readiness.`);
	error.code = 'VSCODE_BRIDGE_READY_TIMEOUT';
	return error;
};

const createBridgeDisposedError = () => {
	const error = new Error('The embedded VS Code host was disposed before it became ready.');
	error.code = 'VSCODE_BRIDGE_DISPOSED';
	return error;
};

const createBridgeReloadingError = () => {
	const error = new Error('The embedded VS Code host started a new load before it became ready.');
	error.code = 'VSCODE_BRIDGE_RELOADING';
	return error;
};

const createBridgeUnavailableError = method => {
	const error = new Error(`The embedded VS Code bridge is unavailable for "${method}".`);
	error.code = 'VSCODE_BRIDGE_UNAVAILABLE';
	return error;
};

const createReadyState = () => {
	const deferred = createDeferred();
	deferred.promise.catch(() => {});

	const readyState = {
		promise: deferred.promise
		, timerId: null
		, settled: false
	};

	readyState.resolve = value => {
		if(readyState.settled)
		{
			return;
		}

		readyState.settled = true;

		if(readyState.timerId)
		{
			clearTimeout(readyState.timerId);
			readyState.timerId = null;
		}

		deferred.resolve(value);
	};

	readyState.reject = error => {
		if(readyState.settled)
		{
			return;
		}

		readyState.settled = true;

		if(readyState.timerId)
		{
			clearTimeout(readyState.timerId);
			readyState.timerId = null;
		}

		deferred.reject(error);
	};

	return readyState;
};

const createBridgeReadiness = () => {
	return {
		initialReady: createReadyState()
		, activeEpoch: null
		, epochId: 0
	};
};

const createBridgeLifecycle = () => {
	return {
		disposeToken: 0
		, disposeTimerId: null
	};
};

const beginBridgeSetup = bridgeLifecycle => {
	bridgeLifecycle.disposeToken += 1;

	if(bridgeLifecycle.disposeTimerId)
	{
		clearTimeout(bridgeLifecycle.disposeTimerId);
		bridgeLifecycle.disposeTimerId = null;
	}
};

const scheduleBridgeDispose = (bridgeLifecycle, onDispose) => {
	const disposeToken = ++bridgeLifecycle.disposeToken;

	if(bridgeLifecycle.disposeTimerId)
	{
		clearTimeout(bridgeLifecycle.disposeTimerId);
	}

	bridgeLifecycle.disposeTimerId = setTimeout(() => {
		if(bridgeLifecycle.disposeToken !== disposeToken)
		{
			return;
		}

		bridgeLifecycle.disposeTimerId = null;
		onDispose();
	}, 0);
};

const startReadyEpoch = (bridgeReadiness, readyTimeoutMs) => {
	const previousEpoch = bridgeReadiness.activeEpoch;
	const nextEpoch = createReadyState();
	nextEpoch.id = ++bridgeReadiness.epochId;

	if(Number.isFinite(readyTimeoutMs) && readyTimeoutMs > 0)
	{
		nextEpoch.timerId = setTimeout(() => {
			const error = createBridgeReadyTimeoutError(readyTimeoutMs);

			nextEpoch.reject(error);

			if(!bridgeReadiness.initialReady.settled && bridgeReadiness.activeEpoch === nextEpoch)
			{
				bridgeReadiness.initialReady.reject(error);
			}
		}, readyTimeoutMs);
	}

	bridgeReadiness.activeEpoch = nextEpoch;

	if(previousEpoch && !previousEpoch.settled)
	{
		previousEpoch.reject(createBridgeReloadingError());
	}

	return nextEpoch;
};

const isReadyMessage = (event, iframeWindow, expectedOrigin) => {
	if(event?.origin !== expectedOrigin || event?.source !== iframeWindow)
	{
		return false;
	}

	const data = event?.data;

	return !!data
		&& typeof data === 'object'
		&& data.kind === READY_MESSAGE_KIND
		&& data.type === READY_MESSAGE_TYPE;
};

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

export const useVSCode = ({url, fsHandlers = {}, dbgHandlers = {}, readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS}) => {

	const outerUrl = window.location;
	const outerOrigin = outerUrl.origin;

	const innerUrl = new URL(url, outerOrigin);
	const innerOrigin = innerUrl.origin;

	const serverRef = useRef();
	const clientRef = useRef();
	const iframeRef = useRef();
	const bridgeReadinessRef = useRef();
	const bridgeLifecycleRef = useRef();

	if(!bridgeReadinessRef.current)
	{
		bridgeReadinessRef.current = createBridgeReadiness();
	}

	if(!bridgeLifecycleRef.current)
	{
		bridgeLifecycleRef.current = createBridgeLifecycle();
	}

	useEffect(() => {
		if (!iframeRef.current) return;

		const iframe = iframeRef.current;
		const bridgeReadiness = bridgeReadinessRef.current;
		const bridgeLifecycle = bridgeLifecycleRef.current;

		beginBridgeSetup(bridgeLifecycle);

		clientRef.current = Client.forIframe(iframe, innerOrigin);

		if (!serverRef.current) {
			const handlers = {
				...defaultFsHandlers
				, ...defaultDbgHandlers
				, ...fsHandlers
				, ...dbgHandlers
			};
			serverRef.current = new Server(handlers, innerOrigin);
		}

		startReadyEpoch(bridgeReadiness, readyTimeoutMs);

		const onMsg = event => {
			if(isReadyMessage(event, iframeRef.current?.contentWindow, innerOrigin))
			{
				bridgeReadiness.activeEpoch?.resolve(event.data);

				if(!bridgeReadiness.initialReady.settled)
				{
					bridgeReadiness.initialReady.resolve(event.data);
				}

				return;
			}

			serverRef.current.handleMessageEvent(event);
		};

		const onLoad = () => {
			startReadyEpoch(bridgeReadinessRef.current, readyTimeoutMs);
		};

		window.addEventListener('message', onMsg);
		iframe.addEventListener('load', onLoad);

		return () => {
			window.removeEventListener('message', onMsg);
			iframe.removeEventListener('load', onLoad);
			scheduleBridgeDispose(bridgeLifecycleRef.current, () => {
				clientRef.current = null;
				bridgeReadinessRef.current.activeEpoch?.reject(createBridgeDisposedError());

				if(!bridgeReadinessRef.current.initialReady.settled)
				{
					bridgeReadinessRef.current.initialReady.reject(createBridgeDisposedError());
				}
			});
		};
	}, []);

	const VSCode = ({className = ''}) => {
		if (typeof window === 'undefined') return null;

		const frameUrl = new URL(innerUrl.href);
		frameUrl.searchParams.set('origin', outerOrigin);

		return (
			<iframe
				allow="clipboard-read; clipboard-write"
				className={className}
				src = {frameUrl.href}
				ref = {iframeRef}
			></iframe>
		);
	};

	const callClient = (method, ...args) => {
		const waitForActiveReady = () => {
			const bridgeReadiness = bridgeReadinessRef.current;
			const activeEpoch = bridgeReadiness?.activeEpoch;

			if(!activeEpoch)
			{
				throw createBridgeUnavailableError(method);
			}

			return activeEpoch.promise.catch(error => {
				if(error?.code === 'VSCODE_BRIDGE_RELOADING' && bridgeReadinessRef.current?.activeEpoch !== activeEpoch)
				{
					return waitForActiveReady();
				}

				throw error;
			}).then(() => {
				if(bridgeReadinessRef.current?.activeEpoch !== activeEpoch)
				{
					return waitForActiveReady();
				}
			});
		};

		return waitForActiveReady().then(() => {
			if(!clientRef.current)
			{
				throw createBridgeUnavailableError(method);
			}

			return clientRef.current[method](...args);
		});
	};

	const ready = bridgeReadinessRef.current.initialReady.promise;

	const openFile = (path, options = {}) => {
		return callClient('openFile', path, options);
	};

	const configure = (options = {}) => {
		return callClient('configure', options);
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
		, ready
		, openFile
		, configure
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
