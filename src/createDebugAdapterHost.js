const cloneSession = session => session ? { ...session } : session;

const createDebugAdapterResponse = (message, success, body, errorText, seq) => {
	const response = {
		type: 'response'
		, seq
		, request_seq: typeof message?.seq === 'number' ? message.seq : 0
		, command: typeof message?.command === 'string' ? message.command : ''
		, success
	};

	if(success)
	{
		if(body !== undefined)
		{
			response.body = body;
		}

		return response;
	}

	response.message = errorText;
	response.body = {
		error: {
			id: 1
			, format: errorText
		}
	};

	return response;
};

const formatError = error => {
	if(error instanceof Error && error.message)
	{
		return error.message;
	}

	return String(error || 'Unknown debug adapter error.');
};

export const createDebugAdapterHost = ({commands = {}, onSessionEvent} = {}) => {
	const sessions = new Map;
	let activeSessionId = null;
	let nextSeq = 1;
	let sendDebugAdapterMessage = null;

	const nextMessageSeq = () => nextSeq++;

	const getSession = sessionId => {
		if(!sessionId)
		{
			return sessions.get(activeSessionId) ?? null;
		}

		return sessions.get(sessionId) ?? null;
	};

	const listSessions = () => {
		return Array.from(sessions.values()).map(cloneSession);
	};

	const getActiveSession = () => {
		return getSession(activeSessionId);
	};

	const requireSendDebugAdapterMessage = () => {
		if(typeof sendDebugAdapterMessage !== 'function')
		{
			throw new Error('Debug adapter host is not attached to a vscode-react bridge.');
		}

		return sendDebugAdapterMessage;
	};

	const attachBridge = bridge => {
		if(typeof bridge === 'function')
		{
			sendDebugAdapterMessage = bridge;
			return bridge;
		}

		if(typeof bridge?.sendDebugAdapterMessage === 'function')
		{
			sendDebugAdapterMessage = bridge.sendDebugAdapterMessage.bind(bridge);
			return bridge;
		}

		throw new TypeError('attachBridge expects a sendDebugAdapterMessage function or a vscode-react bridge object.');
	};

	const sendMessage = (sessionId, message) => {
		return requireSendDebugAdapterMessage()(sessionId, message);
	};

	const sendEvent = (sessionId, event, body) => {
		const message = {
			type: 'event'
			, seq: nextMessageSeq()
			, event
		};

		if(body !== undefined)
		{
			message.body = body;
		}

		return sendMessage(sessionId, message);
	};

	const sendRequest = (sessionId, command, args) => {
		const message = {
			type: 'request'
			, seq: nextMessageSeq()
			, command
		};

		if(args !== undefined)
		{
			message.arguments = args;
		}

		return sendMessage(sessionId, message);
	};

	const makeContext = (session, message) => ({
		session
		, message
		, command: message.command
		, arguments: message.arguments
		, sendEvent: (event, body) => sendEvent(session.id, event, body)
		, sendRequest: (command, args) => sendRequest(session.id, command, args)
		, getSession
		, getActiveSession
		, listSessions
	});

	const dbgHandlers = {
		async acceptVSCodeMessage(session, message) {
			if(!message || message.type !== 'request')
			{
				return;
			}

			const storedSession = sessions.get(session?.id) ?? cloneSession(session) ?? null;
			const handler = commands[message.command];

			if(typeof handler !== 'function')
			{
				return createDebugAdapterResponse(
					message
					, false
					, undefined
					, `No DAP handler configured for "${message.command}".`
					, nextMessageSeq()
				);
			}

			try
			{
				const result = await handler(makeContext(storedSession, message));

				if(result && result.type === 'response')
				{
					return result;
				}

				return createDebugAdapterResponse(message, true, result, undefined, nextMessageSeq());
			}
			catch(error)
			{
				return createDebugAdapterResponse(
					message
					, false
					, undefined
					, formatError(error)
					, nextMessageSeq()
				);
			}
		}

		, debugSessionStarted(session) {
			sessions.set(session.id, cloneSession(session));
			onSessionEvent?.('debugSessionStarted', cloneSession(session));
		}

		, didStartDebugSession(session) {
			sessions.set(session.id, cloneSession(session));
			activeSessionId = session?.id ?? activeSessionId;
			onSessionEvent?.('didStartDebugSession', cloneSession(session));
		}

		, didTerminateDebugSession(session) {
			sessions.delete(session.id);

			if(activeSessionId === session.id)
			{
				activeSessionId = null;
			}

			onSessionEvent?.('didTerminateDebugSession', cloneSession(session));
		}

		, didChangeActiveDebugSession(session) {
			activeSessionId = session?.id ?? null;
			onSessionEvent?.('didChangeActiveDebugSession', cloneSession(session));
		}
	};

	return {
		dbgHandlers
		, attachBridge
		, getSession
		, getActiveSession
		, listSessions
		, sendEvent
		, sendRequest
	};
};
