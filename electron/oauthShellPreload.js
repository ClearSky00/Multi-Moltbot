"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("oauthShell", {
  close: () => ipcRenderer.invoke("oauth-shell:close"),
});
