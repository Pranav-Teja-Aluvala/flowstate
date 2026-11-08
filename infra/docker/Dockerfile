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
ENV NEXT_PUBLIC_COLLABORATION_URL=$NEXT_PUBLIC_COLLABORATION_URL
RUN npm run build
RUN chown -R node:node apps/web/.next

FROM web-build AS web
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]

FROM base AS collaboration
ENV NODE_ENV=production
USER node
EXPOSE 1234
CMD ["npm", "run", "dev:collaboration"]

FROM base AS migrate
USER node
CMD ["npm", "run", "db:migrate"]
