FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 git ca-certificates && rm -rf /var/lib/apt/lists/*
USER node
WORKDIR /workspace
CMD ["node", "-e", "setInterval(()=>{}, 60000)"]
