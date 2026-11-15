const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

let isProcessing = false;
const queue = [];

function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  const { videoId, cookiesTxt, res } = queue.shift();
  runExtraction(videoId, cookiesTxt, res, () => {
    isProcessing = false;
    processQueue();
  });
}

function runExtraction(videoId, cookiesTxt, res, done) {
  const target = new URL('/watch', 'https://youtube.com');
  target.searchParams.set('v', videoId);
  const videoUrl = target.toString();

  const stamp = `${videoId}-${Date.now()}`;
  const tempFile = path.join(os.tmpdir(), `${stamp}.mp4`);
  const tempCookieFile = path.join(os.tmpdir(), `${stamp}_cookies.txt`);

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  const cleanup = () => {
    [tempFile, tempCookieFile].forEach((f) => fs.unlink(f, () => {}));
  };

  const args = [
    '--newline',
    '--sleep-requests', '1.5',
    '--remote-components', 'ejs:github',
    '-f', 'best[height<=720][ext=mp4]/best[ext=mp4]/best',
    '--no-playlist',
    '-o', tempFile,
    videoUrl
  ];

  if (cookiesTxt && cookiesTxt.trim().length > 0) {
    fs.writeFileSync(tempCookieFile, cookiesTxt);
    args.unshift('--cookies', tempCookieFile);
  }

  const child = spawn('yt-dlp', args);

  child.stdout.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line.includes('[download]') || line.includes('[Merger]')) {
      res.write(JSON.stringify({ type: 'progress', text: line }) + '\n');
    }
  });

  child.stderr.on('data', (chunk) => {
    console.error('yt-dlp stderr:', chunk.toString());
  });

  child.on('close', (code) => {
    if (code !== 0 || !fs.existsSync(tempFile)) {
      cleanup();
      res.write(JSON.stringify({ type: 'error', error: 'Extraction failed. Try loading a fresh cookies.txt.' }) + '\n');
      res.end();
      return done();
    }

    const base64Video = fs.readFileSync(tempFile).toString('base64');
    cleanup();
    res.write(JSON.stringify({ type: 'complete', base64: base64Video }) + '\n');
    res.end();
    done();
  });
}

app.post('/download', (req, res) => {
  const { videoId, cookiesTxt } = req.body;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid YouTube video ID' });
  }

  queue.push({ videoId, cookiesTxt, res });
  processQueue();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
