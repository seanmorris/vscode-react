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
		return { exists: false };
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

export const useVSCode = ({url, fsHandlers}) => {

	const outerUrl = window.location;
	const outerOrigin = outerUrl.origin;

	const innerUrl = new URL(url, outerOrigin);
	const innerOrigin = innerUrl.origin;

	const serverRef = useRef();
	const clientRef = useRef();
	const iframeRef = useRef();

	useEffect(() => {
		if (!iframeRef.current) return;
		clientRef.current = new Client(iframeRef.current.contentWindow, innerOrigin);
		if (!serverRef.current) {
			const handlers = { ...defaultFsHandlers, ...fsHandlers };
			serverRef.current = new Server(handlers, innerUrl.origin);
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

	const openFile = (path) => {
		if(!clientRef.current) {
			console.warn('VSCode is not ready yet.');
			return;
		}

		clientRef.current.openFile(path);
	};

	const executeCommand = (command, ...args) => {
		if(!clientRef.current) {
			console.warn('VSCode is not ready yet.');
			return;
		}

		clientRef.current.executeCommand(command, args);
	};

	return {VSCode, openFile, executeCommand};
};
