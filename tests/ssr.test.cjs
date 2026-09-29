const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { renderToString } = require('react-dom/server');

const { useVSCode } = require(path.resolve(__dirname, '..', 'dist', 'index.js'));

test('useVSCode renders on the server without a window and emits no iframe', () => {
	assert.equal(typeof window, 'undefined');

	const App = () => {
		const { VSCode } = useVSCode({ url: '/editor/', fsHandlers: {} });
		return React.createElement(VSCode, { className: 'editor' });
	};

	assert.equal(renderToString(React.createElement(App)), '');
});
