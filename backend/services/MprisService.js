const path = require('path');
const fs = require('fs');

class MprisService {
  constructor() {
    this.player = null;
    this.mainWindow = null;
    this.isInitialized = false;
    this.currentPositionSeconds = 0;
    this.lastPositionUpdate = Date.now();
    this.isPlaying = false;
    this.defaultIconUri = this.resolveDefaultIconUri();
  }

  resolveDefaultIconUri() {
    const candidateIcons = [
      '/usr/share/icons/hicolor/scalable/apps/brave-music.svg',
      path.join(__dirname, '..', '..', 'src', 'assets', 'app-icon.svg'),
      path.join(__dirname, '..', '..', 'src', 'assets', 'cosl-logo.png')
    ];
    for (const icon of candidateIcons) {
      if (fs.existsSync(icon)) {
        return `file://${path.resolve(icon)}`;
      }
    }
    return '';
  }

  init({ mainWindow }) {
    this.mainWindow = mainWindow;
    if (this.isInitialized) return;
    if (process.platform !== 'linux') {
      console.log('[MprisService] Non-Linux platform, MPRIS integration skipped.');
      return;
    }

    try {
      const Player = require('mpris-service');
      this.player = Player({
        name: 'bravemusic',
        identity: 'Brave Music',
        desktopEntry: 'brave-music',
        supportedUriSchemes: ['file', 'http', 'https'],
        supportedMimeTypes: [
          'audio/mpeg',
          'audio/mp3',
          'audio/ogg',
          'audio/wav',
          'audio/flac',
          'audio/mp4',
          'audio/webm',
          'audio/aac'
        ],
        supportedInterfaces: ['player']
      });

      this.player.canControl = true;
      this.player.canPlay = true;
      this.player.canPause = true;
      this.player.canGoNext = true;
      this.player.canGoPrevious = true;
      this.player.canSeek = true;
      this.player.canRaise = true;
      this.player.canQuit = true;

      // Position querying
      this.player.getPosition = () => {
        if (!this.isPlaying) {
          return Math.round(this.currentPositionSeconds * 1000000);
        }
        const elapsedSec = (Date.now() - this.lastPositionUpdate) / 1000;
        const estimated = this.currentPositionSeconds + elapsedSec;
        return Math.round(Math.max(0, estimated) * 1000000);
      };

      // MPRIS Event Listeners -> Forwarded to renderer
      this.player.on('play', () => this.sendCommand('play'));
      this.player.on('pause', () => this.sendCommand('pause'));
      this.player.on('playpause', () => this.sendCommand('playpause'));
      this.player.on('stop', () => this.sendCommand('stop'));
      this.player.on('next', () => this.sendCommand('next'));
      this.player.on('previous', () => this.sendCommand('previous'));

      this.player.on('seek', (offsetMicroseconds) => {
        const offsetSec = (offsetMicroseconds || 0) / 1000000;
        this.sendCommand('seek', { offset: offsetSec });
      });

      this.player.on('position', (args) => {
        const positionSec = ((args && args.position) || 0) / 1000000;
        this.sendCommand('setposition', { position: positionSec });
      });

      this.player.on('volume', (vol) => {
        this.sendCommand('setvolume', { volume: vol });
      });

      this.player.on('shuffle', (shuffle) => {
        this.sendCommand('shuffle', { shuffle });
      });

      this.player.on('loopStatus', (loopStatus) => {
        this.sendCommand('loopstatus', { loopStatus });
      });

      this.player.on('raise', () => this.raiseWindow());
      this.player.on('quit', () => this.quitApp());

      // Set initial state
      this.player.playbackStatus = 'Stopped';
      this.player.metadata = {
        'mpris:trackid': this.player.objectPath('track/idle'),
        'xesam:title': 'Brave Music',
        'xesam:artist': ['Ad-Free Music Platform'],
        'xesam:album': 'Brave Music',
        'mpris:artUrl': this.defaultIconUri
      };

      this.isInitialized = true;
      console.log('[MprisService] Linux MPRIS2 media controller initialized successfully (org.mpris.MediaPlayer2.bravemusic)');
    } catch (err) {
      console.warn('[MprisService] Notice during MPRIS initialization:', err.message);
    }
  }

  raiseWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  quitApp() {
    try {
      const { app } = require('electron');
      app.quit();
    } catch (e) {}
  }

  sendCommand(action, data = {}) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('mpris-command', { action, ...data });
    }
  }

  updateState(stateData = {}) {
    if (!this.player) return { success: false, error: 'MPRIS service not active' };

    try {
      const {
        title,
        artist,
        album,
        duration,
        position,
        artworkUrl,
        isPlaying,
        isPaused,
        isStopped,
        volume,
        canGoNext,
        canGoPrevious,
        shuffle,
        loopStatus,
        trackId
      } = stateData;

      if (position !== undefined && typeof position === 'number') {
        this.currentPositionSeconds = Math.max(0, position);
        this.lastPositionUpdate = Date.now();
      }

      // Format artwork URI
      let artUri = this.defaultIconUri;
      if (artworkUrl && typeof artworkUrl === 'string' && artworkUrl.trim()) {
        const trimmed = artworkUrl.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('file://')) {
          artUri = trimmed;
        } else if (path.isAbsolute(trimmed) && fs.existsSync(trimmed)) {
          artUri = `file://${trimmed}`;
        }
      }

      // Format track ID object path (D-Bus object path requirement: [a-zA-Z0-9_])
      const rawId = (trackId || title || '0').toString();
      const sanitizedId = rawId.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 32) || '0';
      const mprisTrackId = this.player.objectPath(`track/${sanitizedId}`);

      // Update metadata BEFORE changing playbackStatus so consumers (GNOME Shell) read fresh track data
      if (title || artist) {
        const metadata = {
          'mpris:trackid': mprisTrackId,
          'xesam:title': title || 'Unknown Title',
          'xesam:artist': [artist || 'Brave Music'],
          'xesam:album': album || 'Brave Music',
          'mpris:artUrl': artUri
        };

        if (duration !== undefined && typeof duration === 'number' && duration > 0) {
          metadata['mpris:length'] = Math.round(duration * 1000000);
        }

        this.player.metadata = metadata;
      }

      // Update playbackStatus after metadata is set
      if (isPlaying !== undefined) {
        this.isPlaying = !!isPlaying;
        if (this.isPlaying) {
          this.player.playbackStatus = 'Playing';
        } else if (isPaused) {
          this.player.playbackStatus = 'Paused';
        } else if (isStopped) {
          this.player.playbackStatus = 'Stopped';
        } else {
          this.player.playbackStatus = 'Paused';
        }
      } else if (isPaused) {
        this.isPlaying = false;
        this.player.playbackStatus = 'Paused';
      } else if (isStopped) {
        this.isPlaying = false;
        this.player.playbackStatus = 'Stopped';
      }

      return { success: true };
    } catch (err) {
      console.warn('[MprisService] Failed to update state:', err.message);
      return { success: false, error: err.message };
    }
  }

  stop() {
    if (this.player) {
      try {
        this.player.playbackStatus = 'Stopped';
      } catch (e) {}
    }
  }
}

module.exports = new MprisService();

