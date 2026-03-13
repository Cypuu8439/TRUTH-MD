FROM node:20

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg imagemagick webp git python3 make g++ procps && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Step 1: Install all deps WITHOUT scripts (prevents libsignal native build failure)
RUN npm install --legacy-peer-deps --ignore-scripts

# Step 2: Install node-gyp globally then rebuild better-sqlite3 native binary
RUN npm install -g node-gyp
RUN npm rebuild better-sqlite3 && \
    echo "=== better-sqlite3 binary OK ===" && \
    ls -la /app/node_modules/better-sqlite3/build/Release/better_sqlite3.node

# Step 3: Install optional modules that ws and node-fetch try to load
RUN npm install bufferutil encoding --legacy-peer-deps --ignore-scripts || true

# Step 4: Remove sharp installed without scripts, then reinstall so the prebuilt binary downloads
RUN npm uninstall sharp --legacy-peer-deps && \
    SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install sharp@0.32.6 --legacy-peer-deps

COPY . .

# Step 5: Fetch and apply patches from private repo
ARG GITHUB_PAT
RUN if [ -n "$GITHUB_PAT" ]; then \
      curl -fsSL \
        -H "Authorization: token $GITHUB_PAT" \
        https://raw.githubusercontent.com/Courtney250/truth-md-patcher/main/patch-baileys.cjs \
        -o /tmp/patch-baileys.cjs && \
      node /tmp/patch-baileys.cjs && \
      rm -f /tmp/patch-baileys.cjs; \
    else \
      echo "GITHUB_PAT not set - skipping patches"; \
    fi

EXPOSE 3000 5000

ENV NODE_ENV=production

CMD ["node", "--require", "./preload.cjs", "--max-old-space-size=512", "--optimize-for-size", "index.js"]
