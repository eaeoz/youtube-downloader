const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, '..', 'bin');
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

try {
  const ffmpegSrc = require('ffmpeg-static');
  const ffmpegDest = path.join(BIN_DIR, 'ffmpeg.exe');
  if (!fs.existsSync(ffmpegDest) && fs.existsSync(ffmpegSrc)) {
    fs.copyFileSync(ffmpegSrc, ffmpegDest);
    console.log('Copied ffmpeg.exe (' + Math.round(fs.statSync(ffmpegDest).size / 1024 / 1024) + ' MB)');
  }
} catch (e) { console.log('ffmpeg-static not available:', e.message); }

try {
  const ffprobeSrc = require('ffprobe-static').path;
  const ffprobeDest = path.join(BIN_DIR, 'ffprobe.exe');
  if (!fs.existsSync(ffprobeDest) && fs.existsSync(ffprobeSrc)) {
    fs.copyFileSync(ffprobeSrc, ffprobeDest);
    console.log('Copied ffprobe.exe (' + Math.round(fs.statSync(ffprobeDest).size / 1024 / 1024) + ' MB)');
  }
} catch (e) { console.log('ffprobe-static not available:', e.message); }
