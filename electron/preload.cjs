'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('macscp', {
	ping: () => ipcRenderer.invoke('ping'),
	sessions: {
		list: () => ipcRenderer.invoke('sessions:list'),
		get: (id) => ipcRenderer.invoke('sessions:get', id),
		save: (session) => ipcRenderer.invoke('sessions:save', session),
		delete: (id) => ipcRenderer.invoke('sessions:delete', id),
		saveCredential: (id, secret) => ipcRenderer.invoke('sessions:saveCredential', id, secret),
		getCredential: (id) => ipcRenderer.invoke('sessions:getCredential', id),
	},
	ssh: {
		hosts: () => ipcRenderer.invoke('ssh:hosts'),
		privateKeys: () => ipcRenderer.invoke('ssh:privateKeys'),
		pickPrivateKey: () => ipcRenderer.invoke('ssh:pickPrivateKey'),
	},
	files: {
		connect: (sessionId) => ipcRenderer.invoke('files:connect', sessionId),
		disconnect: (sessionId) => ipcRenderer.invoke('files:disconnect', sessionId),
		isConnected: (sessionId) => ipcRenderer.invoke('files:isConnected', sessionId),
		list: (sessionId, remotePath) => ipcRenderer.invoke('files:list', sessionId, remotePath),
		listLocal: (dirPath) => ipcRenderer.invoke('files:listLocal', dirPath),
		homeDir: () => ipcRenderer.invoke('files:homeDir'),
		download: (sessionId, remotePath, localPath, transferId) => ipcRenderer.invoke('files:download', sessionId, remotePath, localPath, transferId),
		upload: (sessionId, localPath, remotePath, transferId) => ipcRenderer.invoke('files:upload', sessionId, localPath, remotePath, transferId),
		uploadDirectory: (sessionId, localDir, remoteDir, transferId) =>
			ipcRenderer.invoke('files:uploadDirectory', sessionId, localDir, remoteDir, transferId),
		downloadDirectory: (sessionId, remoteDir, localDir, transferId) =>
			ipcRenderer.invoke('files:downloadDirectory', sessionId, remoteDir, localDir, transferId),
		mkdir: (sessionId, remotePath) => ipcRenderer.invoke('files:mkdir', sessionId, remotePath),
		rm: (sessionId, remotePath) => ipcRenderer.invoke('files:rm', sessionId, remotePath),
		rename: (sessionId, oldPath, newPath) => ipcRenderer.invoke('files:rename', sessionId, oldPath, newPath),
		deleteLocal: (filePath) => ipcRenderer.invoke('files:deleteLocal', filePath),
		mkdirLocal: (dirPath) => ipcRenderer.invoke('files:mkdirLocal', dirPath),
		renameLocal: (oldPath, newPath) => ipcRenderer.invoke('files:renameLocal', oldPath, newPath),
		onProgress: (callback) => {
			const handler = (_, data) => callback(data);
			ipcRenderer.on('files:progress', handler);
			return () => ipcRenderer.removeListener('files:progress', handler);
		},
	},
	editor: {
		open: (sessionId, remotePath, editorApp) =>
			ipcRenderer.invoke('editor:open', sessionId, remotePath, editorApp),
		close: (tmpPath) => ipcRenderer.invoke('editor:close', tmpPath),
		list: () => ipcRenderer.invoke('editor:list'),
		onEvent: (callback) => {
			const handler = (_, data) => callback(data);
			ipcRenderer.on('editor:event', handler);
			return () => ipcRenderer.removeListener('editor:event', handler);
		},
	},
});
