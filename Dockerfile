FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

RUN wget -qO /usr/local/bin/buf https://github.com/bufbuild/buf/releases/latest/download/buf-Linux-x86_64 \
    && chmod +x /usr/local/bin/buf

COPY package.json pnpm-lock.yaml buf.gen.yaml ./
RUN pnpm install --frozen-lockfile

COPY proto ./proto
RUN PATH="$PATH:./node_modules/.bin" buf generate

COPY . .

RUN pnpm prisma generate
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY prisma ./prisma

EXPOSE 3001 50051

CMD ["node", "dist/index.js"]