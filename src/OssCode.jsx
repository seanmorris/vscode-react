import { Server } from 'quickbus';
import { useEffect } from 'react';

const defaultFsHandlers = {
  readdir(...args) {
    console.log('readdir', ...args);
    // return this.php.readdir(...args);
    return [];
  },

  async readFile(...args) {
    console.log('readFile', ...args);
    // return Array.from(await this.php.readFile(...args));
  },

  analyzePath(...args) {
    console.log('analyzePath', ...args);
    // return this.php.analyzePath(...args);
    return { exists: false };
  },

  writeFile(path, content) {
    console.log('writeFile', path, content)
    // this.php.writeFile(path, new Uint8Array(content));
    // this.refresh();
  },

  rename(...args) {
    console.log('rename', ...args);
    // this.php.rename(...args);
    // this.refresh();
  },

  mkdir: (...args) => {
    console.log('mkdir', ...args);
    // this.php.mkdir(...args);
    // this.refresh();
  },

  unlink: (...args) => {
    console.log('unlink', ...args);
    // this.php.unlink(...args);
    // this.refresh();
  },

  rmdir: (...args) => {
    console.log('rmdir', ...args);
    // this.php.rmdir(...args);
    // this.refresh();
  },

  activate: (...args) => {
    console.log('activate', ...args)
    // this.window.args.loading = false;
  },
};

export default function OssCode({ossCodeUrl = "", fsHandlers = defaultFsHandlers}) {
  
  ossCodeUrl = new URL(ossCodeUrl);  
  const server = new Server(fsHandlers, ossCodeUrl.origin);
  const onMsg = event => server.handleMessageEvent(event);

  useEffect(() => {
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  });

  return (
    <iframe src = {ossCodeUrl.origin + "?origin=" + window.location.origin}></iframe>
  );

}
