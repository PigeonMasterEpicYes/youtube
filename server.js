const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());

// Mint a fresh, signed-out visitor cookies.txt from the container's own IP
async function mintVisitorCookies(cookieFilePath) {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://youtube.com', { waitUntil: 'networkidle2', timeout: 20000 });
    const cookies = await page.cookies();

    // Format into standard Netscape cookies.txt format for yt-dlp
    const lines = ['# Netscape HTTP Cookie File'];
    for (const c of cookies) {
      const domain = c.domain.startsWith('.') ? c.domain : `.${c.domain}`;
      const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const secure = c.secure ? 'TRUE' : 'FALSE';
      const expiry = c.expires && c.expires > 0 ? Math.floor(c.expires) : Math.floor(Date.now() / 1000) + 86400;
      lines.push(`${domain}\t${flag}\t${c.path}\t${secure}\t${expiry}\t${c.name}\t${c.value}`);
    }

    fs.writeFileSync(cookieFilePath, lines.join('\n') + '\n');
  } finally {
    await browser.close();
  }
}

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

async function runExtraction(videoId, res, done) {
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

  try {
    res.write(JSON.stringify({ type: 'progress', text: '[download] 0.0% Minting visitor session...' }) + '\n');
    await mintVisitorCookies(tempCookieFile);

    const args = [
      '--newline',
      '--cookies', tempCookieFile,
      '--sleep-requests', '1.5',
      '--remote-components', 'ejs:github',
      '-f', 'best[height<=720][ext=mp4]/best[ext=mp4]/best',
      '--no-playlist',
      '-o', tempFile,
      videoUrl
    ];

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
        res.write(JSON.stringify({ type: 'error', error: 'Extraction failed' }) + '\n');
        res.end();
        return done();
      }

      const base64Video = fs.readFileSync(tempFile).toString('base64');
      cleanup();
      res.write(JSON.stringify({ type: 'complete', base64: base64Video }) + '\n');
      res.end();
      done();
    });
  } catch (err) {
    cleanup();
    res.write(JSON.stringify({ type: 'error', error: err.message }) + '\n');
    res.end();
    done();
  }
}

app.get('/download', (req, res) => {
  const videoId = req.query.id;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid YouTube video ID' });
  }

  queue.push({ videoId, res });
  processQueue();
});

const PORT = process.env.PORT || 7860;
app.listen(PORT, () => console.log(`Self-minting server running on port ${PORT}`));
