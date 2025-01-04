const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');
require('@electron/remote/main').initialize();

function createWindow() {
    const isDev = process.env.NODE_ENV === 'development';
    
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'favicon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        autoHideMenuBar: !isDev,
        frame: true
    });

    require('@electron/remote/main').enable(win.webContents);
    win.loadFile('index.html');
    
    if (isDev) {
        win.webContents.openDevTools();
    }

    // Ajouter le raccourci Ctrl+Shift+I pour ouvrir les outils de développement
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        win.webContents.toggleDevTools();
    });

    // Nettoyer le raccourci quand la fenêtre est fermée
    win.on('closed', () => {
        globalShortcut.unregister('CommandOrControl+Shift+I');
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
