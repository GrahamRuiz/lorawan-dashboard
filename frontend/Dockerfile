# ===========================
# Build stage
# ===========================
FROM node:20-alpine AS build

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies
RUN npm ci

# Build-time API URL (passed from docker-compose.yml)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy rest of the frontend source
COPY . .

# Build the Next.js app
RUN npm run build


# ===========================
# Run stage
# ===========================
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy everything from build stage
COPY --from=build /app . 

# Expose port
EXPOSE 3000

# Run Next.js in production mode
CMD ["npm", "run", "start"]
