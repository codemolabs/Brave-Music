const fs = require('fs');
const path = require('path');
const config = require('../config/appConfig');

class LibraryService {
  constructor() {
    this.dbFile = config.paths.dbFile;
    this.db = this.loadDatabase();
    this.resyncDisk();
  }

  get downloadsDir() {
    return config.paths.downloadsDir;
  }

  loadDatabase() {
    try {
      // Clean up any stale tmp files left from previous crashes or interrupted writes
      try {
        const dir = path.dirname(this.dbFile);
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            if (f.startsWith('library.json.tmp.')) {
              fs.unlinkSync(path.join(dir, f));
            }
          }
        }
      } catch (e) {}

      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const tracks = Array.isArray(parsed.tracks) ? parsed.tracks : [];
        const playlists = typeof parsed.playlists === 'object' && parsed.playlists !== null ? parsed.playlists : {};
        // Built-in track safety: ensure "Never Gonna Give You Up" is never part of custom playlists
        const builtInIds = new Set(tracks.filter(t => (t.title || '').toLowerCase().includes('never gonna give you up') || t.isBuiltIn).map(t => t.id));
        if (builtInIds.size > 0) {
          for (const pName in playlists) {
            if (Array.isArray(playlists[pName])) {
              playlists[pName] = playlists[pName].filter(id => !builtInIds.has(id));
            }
          }
        }
        // Reconcile stale/deleted playlist references from tracks
        const activePlaylistNames = new Set(Object.keys(playlists));
        for (const track of tracks) {
          if (track.playlist && !activePlaylistNames.has(track.playlist)) {
            delete track.playlist;
          }
          if (track.album) {
            if (track.album === 'Downloaded Playlist' || track.album === 'Downloaded Album' || (!activePlaylistNames.has(track.album) && track.playlist === track.album)) {
              track.album = 'Single';
            }
          }
        }
        return {
          tracks,
          playlists,
          playlistCovers: typeof parsed.playlistCovers === 'object' && parsed.playlistCovers !== null ? parsed.playlistCovers : {}
        };
      }
    } catch (err) {
      console.error('[LibraryService] Failed to parse library.json:', err.message);
    }
    return { tracks: [], playlists: {}, playlistCovers: {} };
  }

  isBuiltInTrack(track) {
    if (!track) return false;
    if (track.isBuiltIn === true) return true;
    const title = (track.title || '').toLowerCase();
    return title.includes('never gonna give you up');
  }

  saveDatabase() {
    let tmpFile = null;
    try {
      tmpFile = `${this.dbFile}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.db, null, 2), 'utf-8');
      fs.renameSync(tmpFile, this.dbFile);
      return true;
    } catch (err) {
      console.error('[LibraryService] Failed to write library database atomically:', err.message);
      if (tmpFile && fs.existsSync(tmpFile)) {
        try { fs.unlinkSync(tmpFile); } catch (e) {}
      }
      return false;
    }
  }

  // Get full library payload
  getLibrary() {
    const activePlaylistNames = new Set(Object.keys(this.db.playlists || {}));
    for (const track of this.db.tracks) {
      if (track.playlist && !activePlaylistNames.has(track.playlist)) {
        delete track.playlist;
      }
      if (track.album) {
        if (track.album === 'Downloaded Playlist' || track.album === 'Downloaded Album' || (!activePlaylistNames.has(track.album) && track.playlist === track.album)) {
          track.album = 'Single';
        }
      }
    }
    return {
      tracks: this.db.tracks,
      playlists: this.db.playlists,
      playlistCovers: this.db.playlistCovers || {},
      stats: this.getStats(),
      downloadsDir: this.downloadsDir
    };
  }

  getStats() {
    let totalSizeBytes = 0;
    for (const track of this.db.tracks) {
      if (track.sizeBytes) {
        totalSizeBytes += track.sizeBytes;
      } else if (track.filename) {
        const fullPath = path.join(this.downloadsDir, track.filename);
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          totalSizeBytes += stat.size;
        }
      }
    }

    const totalTracks = this.db.tracks.length;
    const totalPlaylists = Object.keys(this.db.playlists).length;
    const sizeMb = (totalSizeBytes / (1024 * 1024)).toFixed(1);

    return {
      totalTracks,
      totalPlaylists,
      totalSizeBytes,
      totalSizeFormatted: `${sizeMb} MB`
    };
  }

  // Add or update track
  addTrack(track) {
    if (!track || !track.id) return null;

    // Check file stats if filename exists
    if (track.filename) {
      const fullPath = path.join(this.downloadsDir, track.filename);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        track.sizeBytes = stat.size;
      }
    }

    // Retain stable ID if track already exists to preserve playlist relationships
    let existingTrack = null;
    if (track.originalId) {
      existingTrack = this.db.tracks.find(t => t.originalId === track.originalId);
    }
    if (!existingTrack) {
      existingTrack = this.db.tracks.find(t => t.id === track.id);
    }

    if (existingTrack) {
      track.id = existingTrack.id;
      this.db.tracks = this.db.tracks.filter(t => t.id !== existingTrack.id);
    }

    this.db.tracks.unshift(track);

    // Register playlist association if applicable
    if (track.playlist) {
      this.addTrackToPlaylist(track.id, track.playlist);
    }

    this.saveDatabase();
    return track;
  }

  // Delete track from disk and database
  deleteTrack(trackId) {
    const track = this.db.tracks.find(t => t.id === trackId);
    if (!track) return { success: false, error: 'Track not found' };
    if (this.isBuiltInTrack(track)) {
      return { success: false, error: 'Built-in track is protected and cannot be deleted' };
    }

    if (track.filename) {
      const fullPath = path.join(this.downloadsDir, track.filename);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) {
          console.error('[LibraryService] Error removing file:', fullPath, e.message);
        }
      }
    }

    this.db.tracks = this.db.tracks.filter(t => t.id !== trackId);

    // Remove from all playlists
    for (const pName in this.db.playlists) {
      if (Array.isArray(this.db.playlists[pName])) {
        this.db.playlists[pName] = this.db.playlists[pName].filter(id => id !== trackId);
      }
    }

    this.saveDatabase();
    return { success: true, trackId };
  }

  // Delete multiple tracks in bulk from disk and database
  deleteTracks(trackIds = []) {
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return { success: false, error: 'No track IDs provided', deletedCount: 0 };
    }

    const idsSet = new Set(trackIds);
    let deletedCount = 0;
    const deletedIds = [];

    this.db.tracks = this.db.tracks.filter(track => {
      if (idsSet.has(track.id)) {
        if (this.isBuiltInTrack(track)) {
          return true; // Keep built-in track protected
        }
        if (track.filename) {
          const fullPath = path.join(this.downloadsDir, track.filename);
          if (fs.existsSync(fullPath)) {
            try {
              fs.unlinkSync(fullPath);
            } catch (e) {
              console.error('[LibraryService] Error removing file during bulk delete:', fullPath, e.message);
            }
          }
        }
        deletedCount++;
        deletedIds.push(track.id);
        return false;
      }
      return true;
    });

    // Remove deleted track IDs from all playlists
    const deletedSet = new Set(deletedIds);
    for (const pName in this.db.playlists) {
      if (Array.isArray(this.db.playlists[pName])) {
        this.db.playlists[pName] = this.db.playlists[pName].filter(id => !deletedSet.has(id));
      }
    }

    this.saveDatabase();
    return { success: true, deletedCount, deletedIds };
  }

  // Playlists Operations
  createPlaylist(name, cover = null) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return { success: false, error: 'Playlist name cannot be empty' };

    if (!this.db.playlists[cleanName]) {
      this.db.playlists[cleanName] = [];
    }
    if (cover && (!this.db.playlistCovers || !this.db.playlistCovers[cleanName])) {
      this.db.playlistCovers = this.db.playlistCovers || {};
      this.db.playlistCovers[cleanName] = cover;
    }
    this.saveDatabase();
    return {
      success: true,
      playlist: cleanName,
      tracks: this.db.playlists[cleanName],
      cover: this.db.playlistCovers?.[cleanName] || null
    };
  }

  setPlaylistCover(name, cover) {
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Playlist name is required' };
    }
    if (!this.db.playlists[cleanName]) {
      this.db.playlists[cleanName] = [];
    }
    this.db.playlistCovers = this.db.playlistCovers || {};
    this.db.playlistCovers[cleanName] = cover;
    this.saveDatabase();
    return { success: true, name: cleanName, cover };
  }

  deletePlaylist(name, deleteFiles = false) {
    if (!this.db.playlists[name]) {
      return { success: false, error: 'Playlist not found' };
    }

    const trackIds = [...(this.db.playlists[name] || [])];

    // If user requested deleting the files inside the playlist as well
    if (deleteFiles && trackIds.length > 0) {
      for (const trackId of trackIds) {
        // deleteTrack removes the physical audio file and track object
        this.deleteTrack(trackId);
      }
    } else {
      // If user deletes playlist only: clean up track album & playlist references in db
      for (const track of this.db.tracks) {
        if (track.playlist === name) {
          delete track.playlist;
        }
        if (track.album === name || track.album === 'Downloaded Playlist') {
          track.album = 'Single';
        }
      }
    }

    delete this.db.playlists[name];
    if (this.db.playlistCovers && this.db.playlistCovers[name]) {
      delete this.db.playlistCovers[name];
    }
    this.saveDatabase();
    return { success: true, deletedFiles: Boolean(deleteFiles) };
  }

  addTrackToPlaylist(trackId, playlistName) {
    if (!playlistName || !trackId) return;
    // Guard: Disallow adding built-in track to any playlist
    const track = (this.db.tracks || []).find(t => t.id === trackId);
    if (track && this.isBuiltInTrack(track)) {
      return;
    }

    if (!this.db.playlists[playlistName]) {
      this.db.playlists[playlistName] = [];
    }
    if (!this.db.playlists[playlistName].includes(trackId)) {
      this.db.playlists[playlistName].push(trackId);
      this.saveDatabase();
    }
  }

  removeTrackFromPlaylist(trackId, playlistName) {
    if (this.db.playlists[playlistName]) {
      this.db.playlists[playlistName] = this.db.playlists[playlistName].filter(id => id !== trackId);
      // Clean up track reference if it had this playlist
      const track = this.db.tracks.find(t => t.id === trackId);
      if (track) {
        if (track.playlist === playlistName) {
          delete track.playlist;
        }
        if (track.album === playlistName) {
          track.album = 'Single';
        }
      }
      this.saveDatabase();
      return { success: true };
    }
    return { success: false, error: 'Playlist not found' };
  }

  // Import local audio files from user's filesystem
  importLocalFiles(filePaths = []) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return { success: false, count: 0, error: 'No files provided' };
    }

    // Storage pre-check
    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(this.downloadsDir);
        const freeBlocks = (typeof stats.bavail === 'number' && stats.bavail >= 0) ? stats.bavail : stats.bfree;
        const freeBytes = freeBlocks * stats.bsize;
        if (freeBytes < 25 * 1024 * 1024) {
          return { success: false, count: 0, error: 'Storage critically low. Please free up disk space.' };
        }
      }
    } catch (e) {}

    const validExtensions = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.mp4', '.m4v', '.aac']);
    const addedTracks = [];

    for (const srcPath of filePaths) {
      try {
        if (!fs.existsSync(srcPath)) continue;
        const ext = path.extname(srcPath).toLowerCase();
        if (!validExtensions.has(ext)) continue;

        const baseFilename = path.basename(srcPath);
        let destFilename = baseFilename;
        let destPath = path.join(this.downloadsDir, destFilename);

        // If not already in downloads directory, copy file
        if (path.resolve(srcPath) !== path.resolve(destPath)) {
          // If collision with different file, prepend timestamp
          if (fs.existsSync(destPath)) {
            const nameNoExt = path.basename(baseFilename, ext);
            destFilename = `${nameNoExt}_${Date.now()}${ext}`;
            destPath = path.join(this.downloadsDir, destFilename);
          }
          try {
            fs.copyFileSync(srcPath, destPath);
          } catch (copyErr) {
            if (fs.existsSync(destPath)) {
              try { fs.unlinkSync(destPath); } catch (e) {}
            }
            throw copyErr;
          }
        }

        const stat = fs.statSync(destPath);
        const nameNoExt = path.basename(destFilename, ext);
        const parts = nameNoExt.split(' - ');
        const artist = parts.length > 1 ? parts[0].trim() : 'Local Audio';
        const title = parts.length > 1 ? parts.slice(1).join(' - ').trim() : nameNoExt.replace(/_/g, ' ');

        const trackData = {
          id: `import_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          originalId: nameNoExt,
          title,
          artist,
          album: 'Local Storage',
          duration: 0,
          thumbnail: '',
          filename: destFilename,
          sizeBytes: stat.size,
          addedAt: new Date().toISOString(),
          playlist: null
        };

        const saved = this.addTrack(trackData);
        if (saved) addedTracks.push(saved);
      } catch (err) {
        console.error('[LibraryService] Error importing local file:', srcPath, err.message);
      }
    }

    this.saveDatabase();
    return { success: true, count: addedTracks.length, tracks: addedTracks };
  }

  // Update downloads folder location
  setDownloadsFolder(newFolder) {
    if (!newFolder || typeof newFolder !== 'string') return { success: false, error: 'Invalid folder path' };
    try {
      config.paths.downloadsDir = newFolder;
      this.resyncDisk();
      return { success: true, downloadsDir: this.downloadsDir };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }


  // Scan downloads folder to reconcile with actual disk contents
  resyncDisk() {
    try {
      if (!fs.existsSync(this.downloadsDir)) return;
      const files = fs.readdirSync(this.downloadsDir);

      // Verify existing tracks exist on disk
      const existingTrackFilenames = new Set();
      this.db.tracks = this.db.tracks.filter(t => {
        if (this.isBuiltInTrack(t)) return true;
        if (!t.filename) return false;
        const exists = fs.existsSync(path.join(this.downloadsDir, t.filename));
        if (exists) existingTrackFilenames.add(t.filename);
        return exists;
      });

      // Index untracked media files found on disk
      for (const file of files) {
        if (existingTrackFilenames.has(file)) continue;
        const ext = path.extname(file).toLowerCase();
        if (['.m4a', '.mp3', '.opus', '.webm', '.flac', '.ogg', '.mp4', '.m4v', '.mkv'].includes(ext)) {
          const baseName = path.basename(file, ext);
          const fullPath = path.join(this.downloadsDir, file);
          const stat = fs.statSync(fullPath);

          let cleanTitle = baseName.replace(/_/g, ' ');
          cleanTitle = cleanTitle.replace(/\s*\[[a-zA-Z0-9_-]{6,16}\]$/, '').trim() || cleanTitle;

          this.db.tracks.push({
            id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            originalId: baseName,
            title: cleanTitle,
            artist: 'Offline Audio',
            album: 'Local Storage',
            duration: 0,
            thumbnail: '',
            filename: file,
            sizeBytes: stat.size,
            addedAt: stat.birthtime ? stat.birthtime.toISOString() : new Date().toISOString(),
            playlist: null
          });
        }
      }

      // Deduplicate any records pointing to the same file
      const seenFiles = new Set();
      this.db.tracks = this.db.tracks.filter(t => {
        if (!t.filename) return true;
        if (seenFiles.has(t.filename)) return false;
        seenFiles.add(t.filename);
        return true;
      });

      this.saveDatabase();
    } catch (e) {
      console.error('[LibraryService] Error in resyncDisk:', e.message);
    }
  }
}

module.exports = new LibraryService();
