const streamServer = require('../services/StreamServer');
const mediaService = require('../services/MediaService');

class MediaController {
  getStreamUrl(event, filename) {
    if (!filename) return { success: false, error: 'Filename is required' };
    const port = streamServer.getPort();
    if (!port) return { success: false, error: 'Stream server not ready' };
    const url = `http://127.0.0.1:${port}/${encodeURIComponent(filename)}`;
    return { success: true, url, port };
  }

  openFile(event, filename) {
    if (!filename) return { success: false, error: 'Filename is required' };
    return mediaService.openFile(filename);
  }

  showInFolder(event, filename) {
    if (!filename) return { success: false, error: 'Filename is required' };
    return mediaService.showInFolder(filename);
  }

  openFolder() {
    return mediaService.openDownloadsFolder();
  }
}

module.exports = new MediaController();
