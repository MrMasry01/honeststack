# HonestStack World Cup — Remotion render service
# Follows Remotion's official Docker guidance:
# https://www.remotion.dev/docs/docker

FROM node:22-bookworm-slim

# ---------------------------------------------------------------------------
# Install the shared libraries headless Chrome (used by Remotion) needs.
# This is the package list from Remotion's official Dockerfile.
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------------------------------------------------------------------------
# Install dependencies first so Docker can cache this layer.
# devDependencies are included because tsx (used to run server.ts) and the
# @types packages live there.
# ---------------------------------------------------------------------------
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Copy the rest of the project.
# ---------------------------------------------------------------------------
COPY . .

# ---------------------------------------------------------------------------
# Download the Chrome Headless Shell that Remotion renders with.
# ---------------------------------------------------------------------------
RUN npx remotion browser ensure

# Railway provides PORT at runtime; EXPOSE is documentation only.
EXPOSE 3000

# Start the always-on HTTP render service.
CMD ["npx", "tsx", "server.ts"]
