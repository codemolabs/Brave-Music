let shell;
try {
  shell = require('electron').shell;
} catch (e) {
  shell = {
    openPath: async () => '',
    showItemInFolder: () => {}
  };
}
const path = require('path');
const fs = require('fs');
const config = require('../config/appConfig');

class MediaService {
  get downloadsDir() {
    return config.paths.downloadsDir;
  }

  // Safely resolve file path inside downloads directory
  resolveSafePath(filename) {
    if (!filename || typeof filename !== 'string') return null;
    const sanitized = path.basename(filename);
    const fullPath = path.join(this.downloadsDir, sanitized);

    if (fullPath.startsWith(this.downloadsDir) && fs.existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }

  // Open file in OS default media player (e.g. VLC, Rhythmbox, Amberol)
  async openFile(filename) {
    const fullPath = this.resolveSafePath(filename);
    if (!fullPath) {
      return { success: false, error: 'File does not exist on disk' };
    }

    try {
      const err = await shell.openPath(fullPath);
      if (err) {
        return { success: false, error: err };
      }
      return { success: true, path: fullPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Highlight file in file manager (e.g. Nautilus, Dolphin)
  showInFolder(filename) {
    const fullPath = this.resolveSafePath(filename);
    if (!fullPath) {
      return { success: false, error: 'File does not exist on disk' };
    }

    try {
      shell.showItemInFolder(fullPath);
      return { success: true, path: fullPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Open the entire downloads folder
  async openDownloadsFolder() {
    try {
      if (!fs.existsSync(this.downloadsDir)) {
        fs.mkdirSync(this.downloadsDir, { recursive: true });
      }
      const err = await shell.openPath(this.downloadsDir);
      if (err) return { success: false, error: err };
      return { success: true, path: this.downloadsDir };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = new MediaService();
