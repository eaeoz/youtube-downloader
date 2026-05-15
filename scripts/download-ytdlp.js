const https = require('https');
const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const OUTPUT = path.join(BIN_DIR, 'yt-dlp.exe');
const URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

if (fs.existsSync(OUTPUT)) {
  const stat = fs.statSync(OUTPUT);
  if (stat.size > 1000000) {
    console.log('yt-dlp.exe already exists (' + Math.round(stat.size / 1024 / 1024) + ' MB), skipping download.');
    process.exit(0);
  }
}

console.log('Downloading yt-dlp.exe...');

function download(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(outputPath);
        console.log('Redirecting to:', response.headers.location);
        download(response.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      const total = parseInt(response.headers['content-length'] || '0');
      let downloaded = 0;
      response.pipe(file);
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          process.stdout.write(`\rDownloading... ${Math.round((downloaded / total) * 100)}%`);
        }
      });
      file.on('finish', () => {
        file.close();
        const stat = fs.statSync(outputPath);
        if (stat.size === 0) {
          reject(new Error('Downloaded file is empty'));
          return;
        }
        console.log('\n' + path.basename(outputPath) + ' downloaded successfully! (' + Math.round(stat.size / 1024 / 1024) + ' MB)');
        resolve();
      });
    });
    request.on('error', (e) => { file.close(); try { fs.unlinkSync(outputPath); } catch(_) {}; reject(e); });
  });
}

download(URL, OUTPUT).catch(e => {
  console.error('Failed to download yt-dlp.exe:', e.message);
  console.log('You can manually download it from:');
  console.log('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
  console.log('Place the file in: ' + BIN_DIR);
  process.exit(1);
});
