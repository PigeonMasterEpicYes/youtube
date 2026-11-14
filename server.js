const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());

let isProcessing = false;
const queue = [];

function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  const { videoId, res } = queue.shift();
  runExtraction(videoId, res, () => {
    isProcessing = false;
    processQueue();
  });
}

function runExtraction(videoId, res, done) {
  const target = new URL('/watch', 'https://youtube.com');
  target.searchParams.set('v', videoId);
  const videoUrl = target.toString();

  console.log('Extracting full URL:', videoUrl);
  const tempFile = path.join(os.tmpdir(), `${videoId}-${Date.now()}.mp4`);

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  const args = [
    '--newline',
    '--sleep-requests', '1.5',
    '--remote-components', 'ejs:github',
    '--extractor-args', 'youtube:player_client=tv_simply,web',
    '-f', 'best[height<=720][ext=mp4]/best[ext=mp4]/best',
    '--no-playlist',
    '-o', tempFile,
    videoUrl
  ];


  const cookiesPath = path.join(__dirname, 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    console.log('Attaching cookies.txt to yt-dlp...');
    args.unshift('--cookies', cookiesPath);
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
      res.write(JSON.stringify({ type: 'error', error: 'Extraction failed' }) + '\n');
      res.end();
      return done();
    }

    const base64Video = fs.readFileSync(tempFile).toString('base64');
    res.write(JSON.stringify({ type: 'complete', base64: base64Video }) + '\n');
    res.end();

    fs.unlink(tempFile, () => {});
    done();
  });
}

app.get('/download', (req, res) => {
  const videoId = req.query.id;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid YouTube video ID' });
  }

  queue.push({ videoId, res });
  processQueue();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
