import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useVSCode } from '../../dist/index.mjs';

const filePath = '/workspace/demo.php';
const fileContent = `<?php
echo "Hello from vscode-react";
`;
const fileBytes = Array.from(new TextEncoder().encode(fileContent));

const state = {
	calls: []
	, ready: false
	, openFile: null
	, executeCommand: null
	, filePath
	, fileContent
};

window.__vscodeReactE2E = state;

const record = (name, ...args) => {
	state.calls.push([name, ...args]);
};

function Harness()
{
	const { VSCode, openFile, executeCommand } = useVSCode({
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
	});

	useEffect(() => {
		state.openFile = openFile;
		state.executeCommand = executeCommand;
		state.ready = true;
	}, [openFile, executeCommand]);

	return React.createElement(VSCode, { className: 'editor-frame' });
}

createRoot(document.getElementById('root')).render(React.createElement(Harness));
