import { Server } from 'quickbus';
import { useEffect } from 'react';

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

export default function VSCode({className = '', ossCodeUrl = "", fsHandlers = {}}) {

	ossCodeUrl = new URL(ossCodeUrl);
	const server = new Server(fsHandlers, ossCodeUrl.origin);
	const onMsg = event => server.handleMessageEvent(event);

	useEffect(() => {
		window.addEventListener('message', onMsg);
		return () => window.removeEventListener('message', onMsg);
	});

	return (
		<iframe className={className} src = {ossCodeUrl.href + "?origin=" + window.location.origin}></iframe>
	);
}