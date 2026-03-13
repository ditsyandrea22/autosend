# =============================================================================
# MEV Rescue Bot - Docker Configuration
# =============================================================================
# Multi-stage build for optimized image size and security

# -----------------------------------------------------------------------------
# Base Stage
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base

# Install dependencies needed for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc-dev

WORKDIR /app

# -----------------------------------------------------------------------------
# Dependencies Stage
# -----------------------------------------------------------------------------
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install dependencies with production flag
RUN npm ci --only=production

# -----------------------------------------------------------------------------
# Development Stage
# -----------------------------------------------------------------------------
FROM base AS development

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# -----------------------------------------------------------------------------
# Production Stage
# -----------------------------------------------------------------------------
FROM base AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S rescue-bot -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built files
COPY --from=deps /app/node_modules ./node_modules
COPY dist ./dist
COPY config ./config
COPY --chown=rescue-bot:nodejs . .

# Switch to non-root user
USER rescue-bot

# Environment variables
ENV NODE_ENV=production
ENV LOG_PRETTY=false

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start command
CMD ["npm", "run", "start:prod"]

# -----------------------------------------------------------------------------
# Builder Stage (for builds without cache)
# -----------------------------------------------------------------------------
FROM node:20 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create production image
FROM production AS release

# Copy build artifacts
COPY --from=builder /app/dist ./dist
