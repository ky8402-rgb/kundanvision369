# ==============================================================================
# Hugging Face Spaces Dockerfile for GigPilot (React + Express + Node.js)
# ==============================================================================
FROM node:20-slim AS builder

# Install system dependencies (OpenSSL required for Prisma engine)
RUN apt-get update -y && apt-get install -y openssl curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package descriptors first for Docker layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client
RUN if [ -f "prisma/schema.prisma" ]; then npx prisma generate; fi

# Build client SPA and bundled server
RUN npm run build

# ==============================================================================
# Runner Stage
# ==============================================================================
FROM node:20-slim AS runner

# Install system dependencies for runtime
RUN apt-get update -y && apt-get install -y openssl curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces requires running as a non-root user with UID 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user
ENV PATH=/home/user/.local/bin:$PATH
WORKDIR $HOME/app

# Copy package files and production node_modules from builder
COPY --chown=user:user --from=builder /app/package*.json ./
COPY --chown=user:user --from=builder /app/node_modules ./node_modules
COPY --chown=user:user --from=builder /app/dist ./dist
COPY --chown=user:user --from=builder /app/prisma ./prisma

# Copy static assets and configurations
COPY --chown=user:user .env.example ./

# Hugging Face Spaces default port is 7860
ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860

# Start server
CMD ["node", "dist/server.cjs"]
