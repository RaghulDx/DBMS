# ---- deps ----
FROM node:20-slim AS deps
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runtime ----
FROM node:20-slim AS runner
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY package.json ./

EXPOSE 4000
CMD ["node", "dist/server.js"]
