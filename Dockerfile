FROM node:20-slim

# Install Python, pip, curl, unzip, and FFmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    unzip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Deno (yt-dlp's default JS runtime for n-challenge solving)
RUN curl -fsSL https://deno.land | DENO_INSTALL=/usr/local sh

# Install yt-dlp with [default] extras + automatic PO Token generator plugin
RUN pip3 install --no-cache-dir --break-system-packages -U "yt-dlp[default]" bgutil-ytdlp-pot-provider

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
