const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ 
    show: false, 
    webPreferences: { 
      plugins: true,
      webSecurity: true
    } 
  });
  await win.loadURL('https://open.spotify.com');
  const res = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        const config = [{
          initDataTypes: ['cenc'],
          audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
        }];
        const acc = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', config);
        return { ok: true, keySystem: acc.keySystem };
      } catch (e) {
        return { ok: false, err: e.name + ': ' + e.message };
      }
    })()
  `);
  console.log('CastLabs Widevine on Spotify Result:', JSON.stringify(res, null, 2));
  app.quit();
});
