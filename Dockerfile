FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Устанавливаем buf
RUN wget -qO /usr/local/bin/buf https://github.com/bufbuild/buf/releases/latest/download/buf-Linux-x86_64 \
    && chmod +x /usr/local/bin/buf

COPY package.json pnpm-lock.yaml buf.gen.yaml ./
RUN pnpm install --frozen-lockfile

# Копируем proto submodule и генерируем
COPY proto ./proto
RUN PATH="$PATH:./node_modules/.bin" buf generate

# Копируем остальные исходники
COPY . .

# Генерируем Prisma клиент
RUN pnpm prisma generate

# Собираем TypeScript
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

EXPOSE 3001 50051

CMD ["node", "dist/index.js"]