const { app } = require('electron');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('in-process-gpu');

app.on('widevine-ready', (version, lastVersion) => {
  console.log('>>> CastLabs Widevine is ready! Version:', version);
  app.quit();
});

app.on('widevine-error', (error) => {
  console.log('>>> CastLabs Widevine error:', error);
  app.quit();
});

app.whenReady().then(() => {
  console.log('App ready, waiting for widevine-ready or widevine-error...');
});
