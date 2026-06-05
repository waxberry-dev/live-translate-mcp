FROM node:18-alpine

RUN apk add --no-cache espeak-ng

RUN npm install -g live-translate-mcp

ENV ANTHROPIC_API_KEY=""

CMD ["live-translate-mcp"]
