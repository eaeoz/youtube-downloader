const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { EventEmitter } = require('events');

process.on('unhandledRejection', (err) => console.error('Unhandled:', err));
process.on('uncaughtException', (err) => console.error('Uncaught:', err));

const app = express();
const PORT = process.env.PORT || 3777;
const PUBLIC_DIR = path.join(__dirname, 'public');
const BIN_PATH = process.env.BIN_PATH || path.join(__dirname, '..', 'bin');
const SETTINGS_FILE = process.env.ELECTRON_USERDATA ? path.join(process.env.ELECTRON_USERDATA, 'settings.json') : path.join(__dirname, '..', 'settings.json');
const DOWNLOADS_STATE_FILE = process.env.ELECTRON_USERDATA ? path.join(process.env.ELECTRON_USERDATA, 'downloads-state.json') : path.join(__dirname, '..', 'downloads-state.json');
const ERRORS_STATE_FILE = process.env.ELECTRON_USERDATA ? path.join(process.env.ELECTRON_USERDATA, 'errors-state.json') : path.join(__dirname, '..', 'errors-state.json');
const APP_PATH = process.env.APP_PATH || __dirname;

const DEFAULT_DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
if (!fs.existsSync(DEFAULT_DOWNLOADS_DIR)) fs.mkdirSync(DEFAULT_DOWNLOADS_DIR, { recursive: true });

const downloadEmitters = {};
const downloadProcs = {};
const playlistDirs = {};
let downloadIdCounter = 0;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC_DIR, { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate') }));
app.use('/downloads', express.static(DEFAULT_DOWNLOADS_DIR));

function loadSettings() {
  try { if (fs.existsSync(SETTINGS_FILE)) return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch (_) {}
  return {};
}
function saveSettings(data) {
  const current = loadSettings();
  const merged = { ...current, ...data };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

function getDownloadsDir() {
  const settings = loadSettings();
  if (settings.downloadPath) return settings.downloadPath;
  if (process.env.DOWNLOAD_PATH) return process.env.DOWNLOAD_PATH;
  return DEFAULT_DOWNLOADS_DIR;
}

function loadDownloadsState() {
  try { if (fs.existsSync(DOWNLOADS_STATE_FILE)) return JSON.parse(fs.readFileSync(DOWNLOADS_STATE_FILE, 'utf-8')); } catch (_) {}
  return [];
}
function saveDownloadsState(downloads) {
  fs.writeFileSync(DOWNLOADS_STATE_FILE, JSON.stringify(downloads, null, 2));
}

function loadErrorsState() {
  try { if (fs.existsSync(ERRORS_STATE_FILE)) return JSON.parse(fs.readFileSync(ERRORS_STATE_FILE, 'utf-8')); } catch (_) {}
  return [];
}
function saveErrorsState(errors) {
  fs.writeFileSync(ERRORS_STATE_FILE, JSON.stringify(errors, null, 2));
}

function getYtdlpPath() {
  const binPath = BIN_PATH;
  const exePath = path.join(binPath, 'yt-dlp.exe');
  if (fs.existsSync(exePath)) return exePath;
  return 'yt-dlp.exe';
}

function ensureFfmpeg() {
  const binDir = BIN_PATH;
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
  try {
    const ffmpegSrc = require('ffmpeg-static');
    const ffmpegDest = path.join(binDir, 'ffmpeg.exe');
    if (!fs.existsSync(ffmpegDest) && ffmpegSrc && fs.existsSync(ffmpegSrc)) {
      fs.copyFileSync(ffmpegSrc, ffmpegDest);
      console.log('[ffmpeg] copied ffmpeg.exe');
    }
  } catch (e) { console.warn('[ffmpeg] ffmpeg-static not available:', e.message); }
  try {
    const ffprobeSrc = require('ffprobe-static').path;
    const ffprobeDest = path.join(binDir, 'ffprobe.exe');
    if (!fs.existsSync(ffprobeDest) && ffprobeSrc && fs.existsSync(ffprobeSrc)) {
      fs.copyFileSync(ffprobeSrc, ffprobeDest);
      console.log('[ffmpeg] copied ffprobe.exe');
    }
  } catch (e) { console.warn('[ffmpeg] ffprobe-static not available:', e.message); }
  return binDir;
}
let FFMPEG_DIR = BIN_PATH;
process.nextTick(() => { FFMPEG_DIR = ensureFfmpeg(); });

function sanitize(str) {
  return str.replace(/[<>:"/\\|?*]/g, '').trim();
}

function isPlaylist(url) {
  const u = url.toLowerCase();
  return u.includes('list=') || u.includes('/playlist?') || u.includes('/playlists?');
}

function execSpawn(command, args, eventEmitter, stage, trackId) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    if (trackId) downloadProcs[trackId] = proc;
    let stderr = '';
    let stdout = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        if (eventEmitter) eventEmitter.emit('progress', { stage, message: line });
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        if (eventEmitter) {
          if (line.includes('[download]') && line.includes('%')) {
            const pctMatch = line.match(/(\d+\.?\d*)%/);
            const progress = pctMatch ? parseFloat(pctMatch[1]) : 0;
            eventEmitter.emit('progress', { stage, message: line.trim(), progress });
          } else if (line.includes('[ExtractAudio]')) {
            eventEmitter.emit('progress', { stage: 'extract', message: line.trim() });
          } else if (line.includes('[Merger]')) {
            eventEmitter.emit('progress', { stage: 'merge', message: line.trim() });
          } else {
            eventEmitter.emit('progress', { stage, message: line.trim() });
          }
        }
      }
    });

    proc.on('close', (code, signal) => {
      if (trackId) delete downloadProcs[trackId];
      if (signal === 'SIGTERM') return resolve({ stdout, stderr, cancelled: true });
      if (code === 0) return resolve({ stdout, stderr });
      else {
        const allLines = stderr.split('\n').filter(l => l.trim());
        const cleanLines = allLines.filter(l => !(l.includes('[download]') && l.includes('%'))).slice(-30);
        const cleanErr = cleanLines.join('\n').trim();
        reject(new Error(cleanErr || `Exit code ${code}`));
      }
    });
    proc.on('error', (err) => {
      if (trackId) delete downloadProcs[trackId];
      reject(err);
    });
  });
}

function ensureYtdlp() {
  const ytPath = getYtdlpPath();
  if (fs.existsSync(ytPath)) return true;
  return false;
}

app.get('/api/version', (req, res) => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(APP_PATH, '..', 'package.json'), 'utf-8'));
    res.json({ version: pkg.version });
  } catch (_) {
    res.json({ version: '1.0.0' });
  }
});

app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const ytPath = getYtdlpPath();
    const isPlaylist_ = isPlaylist(url);
    const args = ['--dump-json', '--no-warnings', '--flat-playlist'];
    if (isPlaylist_) args.push('--flat-playlist');
    args.push(url);

    const result = await new Promise((resolve, reject) => {
      const proc = spawn(ytPath, args, { windowsHide: true });
      let stdout = '', stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr.trim() || `Exit code ${code}`));
      });
      proc.on('error', reject);
    });

    const lines = result.trim().split('\n').filter(l => l.trim());
    const items = lines.map(l => JSON.parse(l));

    if (isPlaylist_ && items.length > 1) {
      const playlistTitle = items[0]?.playlist_title || items[0]?.title || 'Playlist';
      res.json({
        isPlaylist: true,
        playlistTitle,
        count: items.length,
        entries: items.map((item, i) => ({
          index: i,
          id: item.id,
          title: item.title || item.fulltitle || `Video ${i + 1}`,
          url: item.url || `https://youtube.com/watch?v=${item.id}`,
          duration: item.duration,
          uploader: item.uploader || item.channel || '',
          thumbnail: item.thumbnail || ''
        }))
      });
    } else {
      const video = items[0];
      res.json({
        isPlaylist: false,
        id: video.id,
        title: video.title || video.fulltitle || 'Unknown',
        url: `https://youtube.com/watch?v=${video.id}`,
        duration: video.duration,
        uploader: video.uploader || video.channel || '',
        thumbnail: video.thumbnail || '',
        formats: (video.formats || []).map(f => ({
          format_id: f.format_id,
          ext: f.ext,
          resolution: f.resolution || `${f.height || '?'}p`,
          filesize: f.filesize,
          format_note: f.format_note || '',
          vcodec: f.vcodec || 'none',
          acodec: f.acodec || 'none',
          height: f.height || 0,
          fps: f.fps || '',
          tbr: f.tbr || 0,
          abr: f.abr || 0
        })).filter(f => f.vcodec !== 'none' || f.acodec !== 'none')
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to get video info' });
  }
});

app.post('/api/list-formats', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const id = `fmt-${++downloadIdCounter}-${Date.now()}`;
  const emitter = new EventEmitter();
  downloadEmitters[id] = emitter;

  res.json({ id });

  const done = (stage, data) => {
    emitter.emit('progress', { ...data, stage });
    setTimeout(() => delete downloadEmitters[id], 2000);
  };

  process.nextTick(async () => {
    try {
      const ytPath = getYtdlpPath();
      done('formats', { message: `Fetching formats for: ${url}`, formats: [] });

      const proc = spawn(ytPath, ['--list-formats', url, '--no-warnings'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      const timeout = setTimeout(() => {
        try { proc.kill(); } catch (_) {}
        done('error', { message: 'yt-dlp timed out (60s). Check your network or yt-dlp version.' });
      }, 60000);

      let fullOutput = '';
      let lineBuf = '';

      proc.stdout.on('data', (d) => {
        const chunk = d.toString();
        fullOutput += chunk;
        lineBuf += chunk;
        const lines = lineBuf.split('\n');
        lineBuf = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) done('formats', { message: line.trim() });
        }
      });

      proc.stderr.on('data', (d) => { fullOutput += d.toString(); });

      proc.on('close', async (code) => {
        clearTimeout(timeout);
        if (lineBuf.trim()) done('formats', { message: lineBuf.trim() });
        if (code !== 0 && !fullOutput.trim()) {
          done('error', { message: `yt-dlp exited with code ${code}. Ensure yt-dlp is working.` });
          return;
        }
        const fmtData = parseAudioBitrates(fullOutput);
        done('formats_done', { message: 'Format listing complete', fullOutput, fmtData });
      });

      proc.on('error', (e) => {
        clearTimeout(timeout);
        done('error', { message: `Failed to start yt-dlp: ${e.message}` });
      });
    } catch (e) {
      done('error', { message: e.message });
    }
  });
});

function parseAudioBitrates(rawOutput) {
  const lines = rawOutput.split('\n');
  let bestId = null, bestBitrate = -1;
  const fmtMap = {};

  for (const line of lines) {
    const idMatch = line.match(/^\s*(\d+)\s/);
    if (!idMatch) continue;
    if (!line.includes('audio only')) continue;

    const fmtId = idMatch[1];
    let tbr = -1;

    const brMatch = line.match(/(\d+(?:\.\d+)?)\s*(k|K)\s+(?:https?|m3u8|dash)/);
    if (brMatch) {
      tbr = parseFloat(brMatch[1]);
    } else {
      const mbrMatch = line.match(/(\d+(?:\.\d+)?)\s*M\s+(?:https?|m3u8|dash)/);
      if (mbrMatch) tbr = parseFloat(mbrMatch[1]) * 1000;
    }

    if (tbr > 0) fmtMap[fmtId] = tbr;
    if (tbr > bestBitrate) { bestBitrate = tbr; bestId = fmtId; }
  }

  let mp3Bitrate = 320;
  if (bestBitrate > 0) {
    if (bestBitrate < 160) mp3Bitrate = 128;
    else if (bestBitrate < 224) mp3Bitrate = 192;
    else if (bestBitrate < 288) mp3Bitrate = 256;
    else mp3Bitrate = 320;
  }

  return { bestId, bestBitrate, mp3Bitrate, fmtMap };
}

app.post('/api/download', async (req, res) => {
  const { url, format, mode, audioOnly, formatCode, audioBitrate } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const isPlaylist_ = isPlaylist(url);
  const id = `dl-${++downloadIdCounter}-${Date.now()}`;
  const emitter = new EventEmitter();
  downloadEmitters[id] = emitter;

  res.json({ id });

  process.nextTick(async () => {
    try {
      const ytPath = getYtdlpPath();
      const ffmpegPath = FFMPEG_DIR;
      const dlDir = getDownloadsDir();
      const isAudio = audioOnly || mode === 'audio' || format === 'mp3';
      const ab = parseInt(audioBitrate) || 0;

      const baseArgs = [
        '--ffmpeg-location', ffmpegPath,
        '--no-warnings',
        '--newline',
        '--progress',
        '-o', path.join(dlDir, isPlaylist_ ? '%(playlist_title)s' : '%(title)s') + `_${id}` + (isPlaylist_ ? '/%(playlist_index)s - %(title)s.%(ext)s' : '.%(ext)s'),
        '--print', 'after_move:filepath'
      ];

      if (formatCode && formatCode !== 'best') {
        if (isAudio) {
          baseArgs.push('-f', formatCode);
          baseArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', ab > 0 ? ab + 'k' : '0');
        } else {
          baseArgs.push('-f', formatCode, '--merge-output-format', 'mp4');
        }
      } else if (isAudio) {
        baseArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', ab > 0 ? ab + 'k' : '0');
      } else {
        baseArgs.push('-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4');
      }

      baseArgs.push(url);

      emitter.emit('progress', { stage: 'start', message: `Starting download: ${url}`, progress: 0 });

      if (isPlaylist_) {
        emitter.emit('progress', { stage: 'playlist', message: `Downloading playlist...`, progress: 0 });
        emitter.emit('progress', { stage: 'start', message: 'Processing playlist items...' });
      }

      let result;
      try {
        result = await execSpawn(ytPath, baseArgs, emitter, 'download', id);
      } catch (err) {
        emitter.emit('progress', { stage: 'error', message: err.message });
        setTimeout(() => delete downloadEmitters[id], 5000);
        return;
      }

      if (result && result.cancelled) {
        emitter.emit('progress', { stage: 'cancelled', message: 'Download cancelled' });
        setTimeout(() => delete downloadEmitters[id], 2000);
        return;
      }

      const stdoutLines = (result.stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
      let finalPath = stdoutLines.filter(l => fs.existsSync(l))[0] || '';

      if (!finalPath) {
        const dlDirContents = fs.readdirSync(dlDir).filter(f => f.includes(id));
        const foundFiles = dlDirContents
          .map(f => path.join(dlDir, f))
          .filter(f => fs.statSync(f).isFile());
        if (foundFiles.length > 0) finalPath = foundFiles[0];
      }

      emitter.emit('progress', {
        stage: 'done',
        message: `Download complete!`,
        progress: 100,
        file: finalPath
      });

      if (finalPath) {
        const state = loadDownloadsState();
        state.unshift({
          id,
          name: path.basename(finalPath),
          path: finalPath,
          url,
          format: format || (isAudio ? 'mp3' : 'video'),
          downloadedAt: new Date().toISOString()
        });
        saveDownloadsState(state);
      }

      setTimeout(() => delete downloadEmitters[id], 5000);
    } catch (e) {
      emitter.emit('progress', { stage: 'error', message: e.message });
      setTimeout(() => delete downloadEmitters[id], 5000);
    }
  });
});

app.post('/api/download-playlist', async (req, res) => {
  const { url, format, audioOnly, formatCode, audioBitrate, startIndex, endIndex } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const id = `pl-${++downloadIdCounter}-${Date.now()}`;
  const emitter = new EventEmitter();
  downloadEmitters[id] = emitter;

  res.json({ id });

  process.nextTick(async () => {
    try {
      const ytPath = getYtdlpPath();
      const ffmpegPath = FFMPEG_DIR;
      const dlDir = getDownloadsDir();

      function buildArgs(extractorArgs) {
        const args = [
          '--ffmpeg-location', ffmpegPath,
          '--no-warnings',
          '--newline',
          '--progress',
          '--print', 'after_move:filepath',
          '--ignore-errors'
        ];
        if (extractorArgs) args.push('--extractor-args', extractorArgs);
        if (startIndex) args.push('--playlist-start', parseInt(startIndex));
        if (endIndex) args.push('--playlist-end', parseInt(endIndex));
        const tmpl = path.join(dlDir, `%(playlist_title)s_pl-${id}/%(playlist_index)s - %(title)s.%(ext)s`);
        if (audioOnly) {
          args.push('-x', '--audio-format', 'mp3');
          const ab = parseInt(audioBitrate) || 0;
          args.push('--audio-quality', ab > 0 ? Math.min(ab, 320) + 'k' : '0');
          args.push('-o', tmpl);
        } else {
          const fmtCode = formatCode || 'bestvideo+bestaudio/best';
          args.push('-f', fmtCode, '--merge-output-format', 'mp4');
          args.push('-o', tmpl);
        }
        const cleanUrl = url.replace(/[?&]index=\d+/g, '').replace(/[?&]$/, '');
        args.push(cleanUrl);
        return args;
      }

      function spawnProcess(args) {
        return new Promise((resolve) => {
          const proc = spawn(ytPath, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
          downloadProcs[id] = proc;
          let stderr = '';
          let lastItemInfo = {};

          proc.stdout.on('data', (data) => {
            const text = data.toString().trim();
            if (text) {
              if (!playlistDirs[id]) {
                const dir = path.dirname(text);
                if (fs.existsSync(dir)) playlistDirs[id] = dir;
              }
              emitter.emit('progress', { stage: 'file_complete', message: `Completed: ${text}`, file: text });
            }
          });

          proc.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            for (const line of text.split('\n').filter(l => l.trim())) {
              const itemMatch = line.match(/\[download\] Downloading item (\d+) of (\d+)/);
              if (itemMatch) {
                lastItemInfo = { current: parseInt(itemMatch[1]), total: parseInt(itemMatch[2]) };
                emitter.emit('progress', { stage: 'playlist_item', message: `Downloading item ${lastItemInfo.current}/${lastItemInfo.total}`, item: lastItemInfo.current, total: lastItemInfo.total });
                continue;
              }
              if (line.includes('[download]') && line.includes('%')) {
                const pctMatch = line.match(/(\d+\.?\d*)%/);
                const speedMatch = line.match(/at\s+([\d.]+[KMG]?i?B\/s)/);
                if (pctMatch && lastItemInfo.current) {
                  emitter.emit('progress', { stage: 'playlist_progress', message: line.trim(), item: lastItemInfo.current, total: lastItemInfo.total, progress: parseFloat(pctMatch[1]), speed: speedMatch ? speedMatch[1] : '' });
                }
                continue;
              }
              if (line.includes('[download]') && line.includes('Destination')) {
                if (!playlistDirs[id]) {
                  const m = line.match(/Destination:\s*(.+)/i);
                  if (m) { const d = path.dirname(m[1].trim()); if (fs.existsSync(d)) playlistDirs[id] = d; }
                }
                continue;
              }
              emitter.emit('progress', { stage: 'info', message: line.trim() });
            }
          });

          proc.on('close', (code) => resolve({ code, stderr }));
          proc.on('error', (e) => resolve({ code: -1, stderr: e.message }));
        });
      }

      emitter.emit('progress', { stage: 'playlist_start', message: 'Starting playlist download...' });

      const result = await spawnProcess(buildArgs(null));

      if (!downloadProcs[id]) {
        emitter.emit('progress', { stage: 'cancelled', message: 'Download cancelled' });
        setTimeout(() => delete downloadEmitters[id], 2000);
        return;
      }

      delete downloadProcs[id];
      delete playlistDirs[id];

      const hadError = result.code > 1 || (result.code < 0);
      const someUnavailable = result.code === 1;
      if (hadError) {
        emitter.emit('progress', { stage: 'error', message: `Download failed: ${result.stderr.substring(0, 500)}` });
      } else if (someUnavailable) {
        emitter.emit('progress', { stage: 'done', message: 'Playlist download complete (some unavailable, lower quality for some)', progress: 100 });
      } else {
        emitter.emit('progress', { stage: 'done', message: 'Playlist download complete!', progress: 100 });
      }
      setTimeout(() => delete downloadEmitters[id], 5000);
    } catch (e) {
      emitter.emit('progress', { stage: 'error', message: e.message });
      setTimeout(() => delete downloadEmitters[id], 5000);
    }
  });
});

app.get('/api/download/progress/:id', (req, res) => {
  const { id } = req.params;
  const emitter = downloadEmitters[id];

  if (!emitter) return res.status(404).json({ error: 'Download not found' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const onProgress = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  emitter.on('progress', onProgress);

  const checkDone = (data) => {
    if (['done', 'error', 'formats_done', 'cancelled'].includes(data.stage)) {
      setTimeout(() => {
        emitter.removeListener('progress', onProgress);
        res.end();
      }, 1000);
    }
  };

  emitter.on('progress', checkDone);

  req.on('close', () => {
    emitter.removeListener('progress', onProgress);
    emitter.removeListener('progress', checkDone);
  });
});

app.post('/api/cancel/:id', (req, res) => {
  const { id } = req.params;
  const proc = downloadProcs[id];
  if (proc) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /f /t /pid ${proc.pid}`, { windowsHide: true, stdio: 'ignore' });
      } else {
        proc.kill('SIGTERM');
      }
    } catch (_) {}
    delete downloadProcs[id];
  }
  const dlDir = getDownloadsDir();
  if (playlistDirs[id]) {
    try {
      if (fs.existsSync(playlistDirs[id])) {
        fs.rmSync(playlistDirs[id], { recursive: true, force: true });
      }
    } catch (_) {}
    delete playlistDirs[id];
  }
  try {
    const entries = fs.readdirSync(dlDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.includes(id)) {
        const fullPath = path.join(dlDir, entry.name);
        if (entry.isDirectory()) fs.rmSync(fullPath, { recursive: true, force: true });
        else fs.unlinkSync(fullPath);
      }
    }
  } catch (_) {}
  try {
    const walkTemp = (dir) => {
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const full = path.join(dir, item.name);
          if (item.isDirectory()) { walkTemp(full); continue; }
          const lower = item.name.toLowerCase();
          if (lower.endsWith('.part') || lower.endsWith('.temp') || lower.endsWith('.ytdl') || lower.endsWith('.m4a') || lower.endsWith('.webm')) {
            try { fs.unlinkSync(full); } catch (_) {}
          }
        }
      } catch (_) {}
    };
    walkTemp(dlDir);
  } catch (_) {}
  const emitter = downloadEmitters[id];
  if (emitter) {
    emitter.emit('progress', { stage: 'cancelled', message: 'Download cancelled' });
    setTimeout(() => delete downloadEmitters[id], 2000);
  }
  res.json({ ok: true, message: 'Cancelled' });
});

app.post('/api/update-ytdlp', (req, res) => {
  const id = `upd-${Date.now()}`;
  const emitter = new EventEmitter();
  downloadEmitters[id] = emitter;

  const ytPath = getYtdlpPath();

  res.json({ id });

  process.nextTick(async () => {
    try {
      emitter.emit('progress', { stage: 'update', message: 'Updating yt-dlp...' });

      const proc = spawn(ytPath, ['-U'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          emitter.emit('progress', { stage: 'update', message: line.trim() });
        }
      });

      proc.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          emitter.emit('progress', { stage: 'update', message: line.trim() });
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          emitter.emit('progress', { stage: 'done', message: 'yt-dlp updated successfully!' });
        } else {
          emitter.emit('progress', { stage: 'error', message: `Update process exited with code ${code}` });
        }
        setTimeout(() => delete downloadEmitters[id], 5000);
      });

      proc.on('error', (e) => {
        emitter.emit('progress', { stage: 'error', message: `Update failed: ${e.message}` });
        setTimeout(() => delete downloadEmitters[id], 5000);
      });
    } catch (e) {
      emitter.emit('progress', { stage: 'error', message: e.message });
      setTimeout(() => delete downloadEmitters[id], 5000);
    }
  });
});

app.post('/api/download-ytdlp', (req, res) => {
  const id = `dlbin-${Date.now()}`;
  const emitter = new EventEmitter();
  downloadEmitters[id] = emitter;

  res.json({ id });

  process.nextTick(async () => {
    try {
      const binDir = BIN_PATH;
      if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
      const outputPath = path.join(binDir, 'yt-dlp.exe');

      emitter.emit('progress', { stage: 'download_bin', message: 'Downloading yt-dlp.exe...', progress: 25 });

      const https = require('https');
      const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

      const file = fs.createWriteStream(outputPath);
      const request = https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            https.get(redirectUrl, (res2) => {
              const total = parseInt(res2.headers['content-length'] || '0');
              let downloaded = 0;
              res2.pipe(file);
              res2.on('data', (chunk) => {
                downloaded += chunk.length;
                if (total > 0) {
                  const pct = Math.round((downloaded / total) * 100);
                  emitter.emit('progress', { stage: 'download_bin', message: `Downloading yt-dlp.exe... ${pct}%`, progress: pct });
                }
              });
              file.on('finish', () => {
                file.close();
                emitter.emit('progress', { stage: 'done', message: 'yt-dlp downloaded successfully!' });
                setTimeout(() => delete downloadEmitters[id], 2000);
              });
            });
            return;
          }
        }
        const total = parseInt(response.headers['content-length'] || '0');
        let downloaded = 0;
        response.pipe(file);
        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.round((downloaded / total) * 100);
            emitter.emit('progress', { stage: 'download_bin', message: `Downloading yt-dlp.exe... ${pct}%`, progress: pct });
          }
        });
        file.on('finish', () => {
          file.close();
          emitter.emit('progress', { stage: 'done', message: 'yt-dlp downloaded successfully!' });
          setTimeout(() => delete downloadEmitters[id], 2000);
        });
      });

      request.on('error', (e) => {
        emitter.emit('progress', { stage: 'error', message: `Failed to download yt-dlp: ${e.message}` });
        setTimeout(() => delete downloadEmitters[id], 2000);
      });
    } catch (e) {
      emitter.emit('progress', { stage: 'error', message: e.message });
      setTimeout(() => delete downloadEmitters[id], 2000);
    }
  });
});

app.get('/api/downloads', (req, res) => {
  res.json(loadDownloadsState());
});

app.post('/api/downloads/clear', (req, res) => {
  saveDownloadsState([]);
  res.json({ ok: true });
});

app.post('/api/downloads/remove', (req, res) => {
  const { id, filePath } = req.body;
  const state = loadDownloadsState().filter(d => d.id !== id);
  saveDownloadsState(state);
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
  res.json({ ok: true });
});

app.get('/api/errors', (req, res) => {
  res.json(loadErrorsState());
});

app.post('/api/errors', (req, res) => {
  const { message, url, stage } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  const errors = loadErrorsState();
  errors.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), message, url: url || '', stage: stage || '', time: new Date().toISOString() });
  if (errors.length > 200) errors.length = 200;
  saveErrorsState(errors);
  res.json({ ok: true });
});

app.post('/api/errors/clear', (req, res) => {
  saveErrorsState([]);
  res.json({ ok: true });
});

app.post('/api/errors/remove', (req, res) => {
  const { id } = req.body;
  saveErrorsState(loadErrorsState().filter(e => e.id !== id));
  res.json({ ok: true });
});

app.post('/api/open-folder', (req, res) => {
  try {
    const cmd = process.platform === 'win32' ? `explorer "${getDownloadsDir()}"` :
      process.platform === 'darwin' ? `open "${getDownloadsDir()}"` : `xdg-open "${getDownloadsDir()}"`;
    require('child_process').exec(cmd);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json(loadSettings());
});

app.post('/api/settings', (req, res) => {
  try {
    const { downloadPath } = req.body;
    if (downloadPath !== undefined) {
      if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });
      saveSettings({ downloadPath });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ytdlp-status', (req, res) => {
  const exists = ensureYtdlp();
  let version = '';
  if (exists) {
    try {
      version = execSync(`"${getYtdlpPath()}" --version`, { encoding: 'utf-8', windowsHide: true }).trim();
    } catch (_) {}
  }
  res.json({ exists, version });
});

async function ensureYtdlpDownload() {
  const binDir = BIN_PATH;
  const outputPath = path.join(binDir, 'yt-dlp.exe');
  if (fs.existsSync(outputPath)) {
    const stat = fs.statSync(outputPath);
    if (stat.size > 1000000) return;
  }
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
  console.log('yt-dlp.exe not found or too small, downloading...');
  try {
    const https = require('https');
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);
      const request = https.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          try { fs.unlinkSync(outputPath); } catch (_) {}
          https.get(response.headers.location, (res2) => {
            res2.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
          }).on('error', reject);
          return;
        }
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      });
      request.on('error', reject);
    });
    const stat = fs.statSync(outputPath);
    if (stat.size > 1000000) console.log('yt-dlp.exe downloaded successfully (' + Math.round(stat.size / 1024 / 1024) + ' MB)');
    else console.warn('yt-dlp.exe download may be incomplete (' + Math.round(stat.size / 1024) + ' KB)');
  } catch (e) {
    console.error('Failed to download yt-dlp.exe:', e.message);
    console.log('Place yt-dlp.exe manually in: ' + binDir);
  }
}

const server = app.listen(PORT, async () => {
  console.log(`YouTube Downloader running at http://localhost:${PORT}`);
  await ensureYtdlpDownload();
});

module.exports = { app, server };

function cleanup() {
  try { server.close(); } catch (_) {}
}
module.exports.cleanup = cleanup;
