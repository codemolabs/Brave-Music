const downloadService = require('../services/DownloadService');

class DownloadController {
  async startDownload(event, { url, isPlaylist, playlistName, format }) {
    if (!url || typeof url !== 'string' || !url.trim()) {
      return { success: false, error: 'Valid URL is required' };
    }

    const senderWebContents = event.sender;

    return downloadService.startDownload({
      url: url.trim(),
      isPlaylist: Boolean(isPlaylist),
      playlistName: playlistName ? String(playlistName).trim() : '',
      format: format || 'audio-mp3',
      onProgress: (progressData) => {
        if (!senderWebContents.isDestroyed()) {
          senderWebContents.send('download-progress', progressData);
        }
      }
    });
  }

  cancelDownload(event, downloadId) {
    if (!downloadId) return { success: false, error: 'downloadId is required' };
    return downloadService.cancelDownload(downloadId);
  }
}

module.exports = new DownloadController();
