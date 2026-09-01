# ==============================================================================
# Stage 1: Build Dependencies & Compile Assets (Frontend & Backend)
# ==============================================================================
FROM node:20-slim AS builder

# Install system dependencies (OpenSSL required for Prisma engine compilation)
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Set builder working directory
WORKDIR /app

# Copy dependency manifests first for maximal Docker layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including devDependencies needed for Vite & esbuild bundling)
RUN npm ci || npm install

# Copy complete application source tree
COPY . .

# Generate Prisma Client if schema is present
RUN if [ -f "prisma/schema.prisma" ]; then npx prisma generate; fi

# Compile React SPA to dist/ and bundle Express backend into dist/server.cjs
ENV NODE_ENV=production
RUN npm run build

# Prune devDependencies to keep the production layer slim
RUN npm prune --production

# ==============================================================================
# Stage 2: Production Runtime (Optimized for Hugging Face Spaces)
# ==============================================================================
FROM node:20-slim AS runner

# Install essential runtime system packages
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces security mandate: run as non-root user with UID 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user
ENV PATH=/home/user/.local/bin:$PATH
WORKDIR $HOME/app

# Copy production dependencies and compiled outputs from builder stage
COPY --chown=user:user --from=builder /app/package*.json ./
COPY --chown=user:user --from=builder /app/node_modules ./node_modules
COPY --chown=user:user --from=builder /app/dist ./dist
COPY --chown=user:user --from=builder /app/prisma ./prisma
COPY --chown=user:user --from=builder /app/server.js ./server.js
COPY --chown=user:user .env.example ./

# Hugging Face Spaces standard runtime port configuration
ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860

# Health check to ensure zero-downtime startup
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:7860/health || exit 1

# Start production server
CMD ["node", "dist/server.cjs"]
