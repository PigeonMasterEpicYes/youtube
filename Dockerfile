FROM denoland/deno:bin AS deno
FROM brainicism/bgutil-ytdlp-pot-provider:latest AS pot
FROM node:20-slim

# Copy pre-built Deno and PO-Token server binaries cleanly
COPY --from=deno /deno /usr/local/bin/deno
COPY --from=pot /app /opt/pot-provider

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp with [default] extras + PO Token plugin
RUN pip3 install --no-cache-dir --break-system-packages -U "yt-dlp[default]" bgutil-ytdlp-pot-provider

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
