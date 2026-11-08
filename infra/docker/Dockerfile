FROM node:24-bookworm-slim AS base
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/collaboration/package.json apps/collaboration/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/github/package.json packages/github/package.json
COPY apps/runner/package.json apps/runner/package.json
RUN npm ci
COPY . .

FROM base AS web-build
ARG NEXT_PUBLIC_COLLABORATION_URL=ws://localhost:1234
ARG NEXT_PUBLIC_RUNNER_URL=ws://localhost:1236
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_COLLABORATION_URL=$NEXT_PUBLIC_COLLABORATION_URL
ENV NEXT_PUBLIC_RUNNER_URL=$NEXT_PUBLIC_RUNNER_URL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
RUN npm run build
RUN chown -R node:node apps/web/.next

FROM web-build AS web
ENV NODE_ENV=production
RUN mkdir -p /app/.local/files && chown -R node:node /app/.local
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "apps/web", "--hostname", "0.0.0.0"]

FROM base AS collaboration
ENV NODE_ENV=production
USER node
EXPOSE 1234
CMD ["node", "--import", "tsx", "apps/collaboration/src/index.ts"]

FROM base AS migrate
USER node
CMD ["npm", "run", "db:migrate"]
