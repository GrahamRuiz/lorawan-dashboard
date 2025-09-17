# frontend/Dockerfile — Alpine with toolchain

# ---------- Build ----------
FROM node:20-alpine AS build
WORKDIR /app

# toolchain for native deps (e.g., sharp)
RUN apk add --no-cache python3 make g++ libc6-compat git

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY . .
RUN npm run build

# ---------- Run ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
