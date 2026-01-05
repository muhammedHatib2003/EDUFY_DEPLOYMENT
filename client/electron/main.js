const path = require('path')
const { app, BrowserWindow, shell } = require('electron')

/* ===============================
   WINDOWS CACHE FIX (ÖNEMLİ)
   =============================== */
app.commandLine.appendSwitch(
  'disk-cache-dir',
  path.join(app.getPath('userData'), 'cache')
)

app.commandLine.appendSwitch('enable-media-stream')
app.commandLine.appendSwitch('use-fake-ui-for-media-stream')

const isDev =
  process.env.NODE_ENV === 'development' ||
  !!process.env.VITE_DEV_SERVER_URL

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const devServerURL =
    process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

  if (isDev) {
    mainWindow.loadURL(devServerURL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadURL('https://edufy-deployment.vercel.app')
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
