FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 git tar ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --chmod=0555 infra/docker/flowstate-cli.mjs /usr/local/bin/flowstate
USER node
WORKDIR /workspace
CMD ["node", "-e", "setInterval(()=>{}, 60000)"]
