const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const config = require('../config/appConfig');

class MusikcubeService {
  constructor() {
    this.process = null;
    this.binPath = this.resolveBinary();
    this.configDir = path.join(os.homedir(), '.config', 'musikcube');
    this.isManaged = false;
  }

  resolveBinary() {
    const candidatePaths = [
      path.join(__dirname, '..', 'engine', 'musikcube', 'musikcubed'),
      path.join(os.homedir(), '.local', 'bin', 'musikcubed'),
      '/usr/bin/musikcubed',
      '/usr/local/bin/musikcubed'
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }
    return 'musikcubed';
  }

  ensureConfig() {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      const librariesFile = path.join(this.configDir, 'libraries.json');
      if (!fs.existsSync(librariesFile)) {
        fs.writeFileSync(librariesFile, JSON.stringify({
          'default-local-library': 1,
          'default-remote-library': 1
        }, null, 2));
      }

      const settingsFile = path.join(this.configDir, 'settings.json');
      if (!fs.existsSync(settingsFile)) {
        fs.writeFileSync(settingsFile, JSON.stringify({
          IndexerLogEnabled: false,
          IndexerThreadCount: 4,
          RemoteLibraryHostname: '127.0.0.1',
          RemoteLibraryLatencyTimeoutMs: 5000,
          RemoteLibraryPassword: '',
          RemoteLibraryWssPort: 7905,
          RemoteLibraryWssTls: false,
          RemoveMissingFiles: true,
          SaveSessionOnExit: true,
          SyncOnStartup: true
        }, null, 2));
      }
    } catch (e) {
      console.warn('[MusikcubeService] Notice on config init:', e.message);
    }
  }

  start() {
    this.ensureConfig();

    try {
      const isAlreadyRunning = this.isRunning();
      if (isAlreadyRunning) {
        console.log('[MusikcubeService] musikcubed daemon already active');
        return { success: true, running: true };
      }

      const engineDir = path.join(__dirname, '..', 'engine', 'musikcube');
      const libPath = path.join(engineDir, 'lib') + ':' + engineDir;

      const env = {
        ...process.env,
        LD_LIBRARY_PATH: `${libPath}:${process.env.LD_LIBRARY_PATH || ''}`
      };

      const child = spawn(this.binPath, ['--foreground'], {
        cwd: fs.existsSync(engineDir) ? engineDir : os.homedir(),
        env,
        stdio: 'ignore',
        detached: true
      });

      child.unref();
      this.process = child;
      this.isManaged = true;
      console.log(`[MusikcubeService] musikcubed daemon launched (PID: ${child.pid})`);
      return { success: true, pid: child.pid };
    } catch (e) {
      console.warn('[MusikcubeService] Failed to start musikcubed:', e.message);
      return { success: false, error: e.message };
    }
  }

  isRunning() {
    try {
      const out = execSync(`${this.binPath} --running`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 });
      return out.includes('running');
    } catch (e) {
      return false;
    }
  }

  stop() {
    if (this.isManaged && this.process) {
      try {
        process.kill(this.process.pid, 'SIGTERM');
      } catch (e) {}
      this.process = null;
    }
    try {
      execSync(`${this.binPath} --stop`, { stdio: 'ignore', timeout: 1500 });
      console.log('[MusikcubeService] musikcubed daemon stopped cleanly');
    } catch (e) {}
  }

  getStatus() {
    return {
      available: fs.existsSync(this.binPath) || this.binPath === 'musikcubed',
      running: this.isRunning(),
      binPath: this.binPath,
      streamingPort: 7906,
      controlPort: 7905
    };
  }
}

module.exports = new MusikcubeService();
