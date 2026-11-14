const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
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

  const args = [
    '--remote-components', 'ejs:github',
    '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '-o', tempFile,
    videoUrl
  ];

  const cookiesPath = path.join(__dirname, 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    console.log('Attaching cookies.txt to yt-dlp...');
    args.unshift('--cookies', cookiesPath);
  }

  execFile('yt-dlp', args, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
    if (error || !fs.existsSync(tempFile)) {
      console.error('yt-dlp stderr:', stderr);
      res.status(500).json({
        error: 'Extraction failed',
        details: stderr || error.message
      });
      return done();
    }

    res.download(tempFile, `${videoId}.mp4`, () => {
      fs.unlink(tempFile, () => {});
      done();
    });
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
