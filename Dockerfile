FROM node:20

  RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg imagemagick webp git python3 make g++ && apt-get clean && rm -rf /var/lib/apt/lists/*

  WORKDIR /app

  COPY package*.json ./

  # Step 1: Install all deps WITHOUT scripts (prevents libsignal native build failure)
  RUN npm install --legacy-peer-deps --ignore-scripts

  # Step 2: Reinstall better-sqlite3 WITH scripts so it downloads prebuilt binary
  RUN npm install better-sqlite3@11.10.0 --legacy-peer-deps

  COPY . .

  EXPOSE 3000 5000

  ENV NODE_ENV=production

  CMD ["npm", "run", "start"]
  