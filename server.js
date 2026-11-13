const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());

app.get('/download', (req, res) => {
  const videoId = req.query.id;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid YouTube video ID' });
  }

  const videoUrl = `https://youtube.com{videoId}`;
  const tempFile = path.join(os.tmpdir(), `${videoId}-${Date.now()}.mp4`);

  const args = [
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', tempFile,
    videoUrl
  ];

  execFile('yt-dlp', args, (error) => {
    if (error || !fs.existsSync(tempFile)) {
      console.error('Extraction error:', error);
      return res.status(500).json({ error: 'Failed to process video stream' });
    }

    res.download(tempFile, `${videoId}.mp4`, () => {
      fs.unlink(tempFile, () => {});
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
