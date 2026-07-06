import { contextBridge, ipcRenderer } from 'electron'

// Expose a minimal, safe API to the renderer.
contextBridge.exposeInMainWorld('api', {
  // Notes persistence
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),

  // Object storage (R2 / Wasabi / S3-compatible)
  storage: {
    getConfig: () => ipcRenderer.invoke('storage:getConfig'),
    setConfig: (cfg) => ipcRenderer.invoke('storage:setConfig', cfg),
    test: () => ipcRenderer.invoke('storage:test'),
    list: (prefix) => ipcRenderer.invoke('storage:list', prefix),
    getUrl: (key) => ipcRenderer.invoke('storage:getUrl', key),
    upload: (key, filePath, contentType) =>
      ipcRenderer.invoke('storage:upload', key, filePath, contentType)
  },

  // Per-area libraries (R2 or local folder); groups are subfolders
  library: {
    getConfig: (area) => ipcRenderer.invoke('library:getConfig', area),
    ensure: (area) => ipcRenderer.invoke('library:ensure', area),
    setConfig: (area, cfg) => ipcRenderer.invoke('library:setConfig', area, cfg),
    list: (area, sub) => ipcRenderer.invoke('library:list', area, sub),
    url: (area, sub) => ipcRenderer.invoke('library:url', area, sub),
    import: (area, dest, srcPath, ct) => ipcRenderer.invoke('library:import', area, dest, srcPath, ct),
    createGroup: (area, name) => ipcRenderer.invoke('library:createGroup', area, name),
    removeGroup: (area, name) => ipcRenderer.invoke('library:removeGroup', area, name),
    remove: (area, sub) => ipcRenderer.invoke('library:remove', area, sub),
    saveDataUrl: (area, dest, filename, dataUrl) =>
      ipcRenderer.invoke('library:saveDataUrl', area, dest, filename, dataUrl),
    shareLink: (area, sub) => ipcRenderer.invoke('library:shareLink', area, sub),
    rename: (area, sub, name) => ipcRenderer.invoke('library:rename', area, sub, name),
    counts: (area) => ipcRenderer.invoke('library:counts', area)
  },

  // Disk scanning + folder picking
  pickFolders: () => ipcRenderer.invoke('fs:pickFolders'),
  pickFiles: (extensions) => ipcRenderer.invoke('fs:pickFiles', extensions),
  commonFolders: () => ipcRenderer.invoke('fs:commonFolders'),
  scan: (roots, extensions) => ipcRenderer.invoke('fs:scan', roots, extensions),
  onScanProgress: (cb) => {
    const handler = (_e, found) => cb(found)
    ipcRenderer.on('scan:progress', handler)
    return () => ipcRenderer.removeListener('scan:progress', handler)
  },
  listFolder: (dir) => ipcRenderer.invoke('fs:listFolder', dir),
  imageHash: (p) => ipcRenderer.invoke('fs:imageHash', p),
  trashFile: (filePath) => ipcRenderer.invoke('fs:trashFile', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('fs:showInFolder', filePath),

  // Screen capture
  captureScreen: () => ipcRenderer.invoke('capture:screen'),
  onShotsCaptured: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('shots:captured', handler)
    return () => ipcRenderer.removeListener('shots:captured', handler)
  },
  // Used by the Print Screen chooser + region-select overlay windows.
  chooseCapture: (mode) => ipcRenderer.send('capture:choose', mode),
  // Used by the post-capture result card window (save/share/edit/discard).
  cardAction: (payload) => ipcRenderer.invoke('capture:card', payload)
})
