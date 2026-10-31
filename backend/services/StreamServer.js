const http = require('http');
const path = require('path');
const fs = require('fs');
const config = require('../config/appConfig');

class StreamServer {
  constructor() {
    this.port = 0;
    this.server = null;
  }

  get downloadsDir() {
    return config.paths.downloadsDir;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        try {
          // Parse requested path and decode URI (stripping query string)
          const rawUrl = (req.url || '').split('?')[0];
          const urlPath = decodeURIComponent(rawUrl.replace(/^\/+/, ''));
          const currentDir = path.resolve(this.downloadsDir);
          const filePath = path.resolve(path.join(currentDir, urlPath));

          // Security: Prevent directory traversal attack
          const rel = path.relative(currentDir, filePath);
          if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File Not Found');
            return;
          }

          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid File Request');
            return;
          }

          const total = stat.size;
          const range = req.headers.range;

          // Content-Type based on extension (supports video containers as audio streams)
          const ext = path.extname(filePath).toLowerCase();
          const contentType = ext === '.mp3' ? 'audio/mpeg' :
                              ext === '.flac' ? 'audio/flac' :
                              ext === '.ogg' ? 'audio/ogg' :
                              ext === '.wav' ? 'audio/wav' :
                              ext === '.m4a' || ext === '.aac' ? 'audio/mp4' :
                              ext === '.mp4' || ext === '.m4v' ? 'video/mp4' :
                              ext === '.webm' ? 'video/webm' :
                              ext === '.mkv' ? 'video/x-matroska' :
                              'application/octet-stream';

          if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

            if (isNaN(start) || isNaN(end) || start > end || start >= total || start < 0) {
              res.writeHead(416, {
                'Content-Range': `bytes */${total}`,
                'Content-Type': 'text/plain'
              });
              res.end('Requested range not satisfiable');
              return;
            }

            const chunksize = (end - start) + 1;

            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': contentType
            });

            const stream = fs.createReadStream(filePath, { start, end });
            stream.on('error', () => {
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Stream Read Error');
              } else {
                res.destroy();
              }
            });
            res.on('close', () => stream.destroy());
            stream.pipe(res);
          } else {
            res.writeHead(200, {
              'Content-Length': total,
              'Accept-Ranges': 'bytes',
              'Content-Type': contentType
            });

            const stream = fs.createReadStream(filePath);
            stream.on('error', () => {
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Stream Read Error');
              } else {
                res.destroy();
              }
            });
            res.on('close', () => stream.destroy());
            stream.pipe(res);
          }
        } catch (err) {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          }
        }
      });

      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        console.log(`[StreamServer] Local streaming server active on 127.0.0.1:${this.port}`);
        resolve(this.port);
      });

      this.server.on('error', (err) => {
        console.error('[StreamServer] Failed to launch server:', err.message);
        reject(err);
      });
    });
  }

  getPort() {
    return this.port;
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = new StreamServer();
