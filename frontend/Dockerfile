# ---------- Build ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# deps de sistema por si hay módulos nativos
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*

# manifiestos
COPY package*.json ./
# si hay package-lock usa ci; si no, instala normal
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# URL del backend para el build del frontend
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# código fuente y build
COPY . .
RUN npm run build

# ---------- Run ----------
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
