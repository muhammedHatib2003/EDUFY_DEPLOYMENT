const { contextBridge } = require('electron')

// Expose a minimal, safe surface for the renderer. Extend as needed.
contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
})
