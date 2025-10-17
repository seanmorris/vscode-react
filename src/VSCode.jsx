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

export default function VSCode({className = '', url, fsHandlers = {}}) {
  if (typeof window === 'undefined') {
    return null;
  }
  const serverRef = useRef();
  const clientRef = useRef();
  const iframeRef = useRef();

  const outerUrl = window.location;
  const innerUrl = new URL(url, outerOrigin);  
  
  const outerOrigin = outerUrl.origin;
  const innerOrigin = innerUrl.origin;
  
  const handlers = { ...defaultFsHandlers, ...fsHandlers };

  if (!serverRef.current) {
    serverRef.current = new Server(handlers, innerUrl.origin);
  }

  if (iframeRef.current) {
    clientRef.current = new Client(iframeRef.current, innerOrigin);
  }

  const onMsg = event => serverRef.current.handleMessageEvent(event);

  useEffect(() => {
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <iframe className={className} ref = {iframeRef} src = {innerUrl.href + "?origin=" + outerOrigin}></iframe>
  );
}
