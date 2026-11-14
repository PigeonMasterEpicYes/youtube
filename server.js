const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
// Allow large video/audio payloads up to 250MB
app.use(express.json({ limit: '250mb' }));

app.post('/merge', (req, res) => {
  const { videoId, videoBase64, audioBase64 } = req.body;
  if (!videoBase64) {
    return res.status(400).json({ error: 'Missing video data' });
  }

  const stamp = `${videoId || 'vid'}-${Date.now()}`;
  const videoPath = path.join(os.tmpdir(), `${stamp}_v.mp4`);
  const audioPath = path.join(os.tmpdir(), `${stamp}_a.m4a`);
  const outPath = path.join(os.tmpdir(), `${stamp}_out.mp4`);

  const cleanup = () => {
    [videoPath, audioPath, outPath].forEach((f) => fs.unlink(f, () => {}));
  };

  try {
    fs.writeFileSync(videoPath, Buffer.from(videoBase64, 'base64'));

    // If there is no separate audio track, return the video directly
    if (!audioBase64) {
      const finalBase64 = fs.readFileSync(videoPath).toString('base64');
      cleanup();
      return res.json({ base64: finalBase64 });
    }

    fs.writeFileSync(audioPath, Buffer.from(audioBase64, 'base64'));

    // Fast lossless stream copy (-c copy) merges video + audio in < 1 second
    const ff = spawn('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-c', 'copy',
      outPath
    ]);

    ff.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(outPath)) {
        cleanup();
        return res.status(500).json({ error: 'FFmpeg merge failed' });
      }

      const mergedBase64 = fs.readFileSync(outPath).toString('base64');
      cleanup();
      res.json({ base64: mergedBase64 });
    });
  } catch (err) {
    cleanup();
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FFmpeg Merge Server running on port ${PORT}`));
