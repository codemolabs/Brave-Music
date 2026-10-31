let dialog;
try {
  dialog = require('electron').dialog;
} catch (e) {
  dialog = null;
}
const libraryService = require('../services/LibraryService');
const streamServer = require('../services/StreamServer');

class LibraryController {
  getLibrary() {
    const data = libraryService.getLibrary();
    return {
      ...data,
      mediaServerPort: streamServer.getPort()
    };
  }

  deleteTrack(event, trackId) {
    if (!trackId) return { success: false, error: 'trackId is required' };
    return libraryService.deleteTrack(trackId);
  }

  createPlaylist(event, payload) {
    if (typeof payload === 'string') {
      return libraryService.createPlaylist(payload);
    }
    const { name, cover } = payload || {};
    return libraryService.createPlaylist(name, cover);
  }

  setPlaylistCover(event, { name, cover }) {
    if (!name) return { success: false, error: 'Playlist name is required' };
    return libraryService.setPlaylistCover(name, cover);
  }

  deletePlaylist(event, payload) {
    if (typeof payload === 'string') {
      return libraryService.deletePlaylist(payload, false);
    }
    const { name, deleteFiles } = payload || {};
    return libraryService.deletePlaylist(name, Boolean(deleteFiles));
  }

  addTrackToPlaylist(event, { trackId, playlistName }) {
    if (!trackId || !playlistName) return { success: false, error: 'trackId and playlistName are required' };
    libraryService.addTrackToPlaylist(trackId, playlistName);
    return { success: true };
  }

  removeTrackFromPlaylist(event, { trackId, playlistName }) {
    if (!trackId || !playlistName) return { success: false, error: 'trackId and playlistName are required' };
    return libraryService.removeTrackFromPlaylist(trackId, playlistName);
  }

  resyncDisk() {
    libraryService.resyncDisk();
    return this.getLibrary();
  }

  // Native Folder Picker for Custom Downloads Location
  async selectDownloadFolder() {
    if (!dialog) return { success: false, error: 'Dialog API unavailable' };
    try {
      const result = await dialog.showOpenDialog({
        title: 'Choose Music Download Folder',
        properties: ['openDirectory', 'createDirectory']
      });
      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        const res = libraryService.setDownloadsFolder(selectedPath);
        return { success: true, downloadsDir: selectedPath, ...res, library: this.getLibrary() };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Native File Picker to Import Existing Music Files
  async importLocalFiles() {
    if (!dialog) return { success: false, error: 'Dialog API unavailable' };
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Music Files to Add to Library',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Audio & Media Files', extensions: ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'opus', 'mp4', 'm4v', 'aac'] }
        ]
      });
      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        const importRes = libraryService.importLocalFiles(result.filePaths);
        return { ...importRes, library: this.getLibrary() };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = new LibraryController();
