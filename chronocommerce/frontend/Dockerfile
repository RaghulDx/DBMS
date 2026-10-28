# ---- deps ----
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
# NEXT_PUBLIC_API_URL is inlined into the client bundle at build time, so it
# must be supplied as a build arg (not just a runtime env var).
FROM deps AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]
