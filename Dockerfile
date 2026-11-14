FROM denoland/deno:bin AS deno
FROM node:20-slim

# Copy pre-built Deno binary cleanly
COPY --from=deno /deno /usr/local/bin/deno

# Install Python, pip, and FFmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp with [default] extras (includes yt-dlp-ejs solver)
RUN pip3 install --no-cache-dir --break-system-packages -U "yt-dlp[default]"

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
