# =============== Build Stage ===============
FROM node:18 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build-time ENV Variablen
ARG SPOTIFY_CLIENT_ID
ARG SPOTIFY_CLIENT_SECRET
ARG SPOTIFY_REDIRECT_URI
ARG NEXT_PUBLIC_BASE_URL

ENV SPOTIFY_CLIENT_ID=$SPOTIFY_CLIENT_ID
ENV SPOTIFY_CLIENT_SECRET=$SPOTIFY_CLIENT_SECRET
ENV SPOTIFY_REDIRECT_URI=$SPOTIFY_REDIRECT_URI
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL

RUN npm run build

# =============== Production Stage ===============
FROM node:18-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app ./

EXPOSE 3000

CMD ["npm", "start"]
