import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import OssCode from './OssCode';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <OssCode
      ossCodeUrl='http://localhost:8080'
      fsHandlers={{
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
          console.log('activate', ...args);
        },
      }
    } />
  </React.StrictMode>
);
