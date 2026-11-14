FROM denoland/deno:bin AS deno
FROM node:20-slim

COPY --from=deno /deno /usr/local/bin/deno

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    git \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp + PO Token provider plugin
RUN pip3 install --no-cache-dir --break-system-packages -U "yt-dlp[default]" bgutil-ytdlp-pot-provider

# Install the local PO Token generator server
RUN git clone --single-branch --branch 1.2.2 https://github.com /opt/pot-provider \
    && cd /opt/pot-provider/server \
    && npm install \
    && npx tsc

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
