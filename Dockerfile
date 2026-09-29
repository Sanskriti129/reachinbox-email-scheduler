# Builds frontend + backend into one image. Run API: node backend/dist/server.js
# Worker: node backend/dist/worker.js   Both in one process: node backend/dist/all.js
FROM node:22-alpine AS build
WORKDIR /app
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/
RUN cd backend && npm ci && cd ../frontend && npm ci
COPY backend backend
COPY frontend frontend
RUN cd frontend && npm run build && cd ../backend && npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/node_modules backend/node_modules
COPY --from=build /app/backend/package.json backend/
COPY --from=build /app/frontend/dist frontend/dist
EXPOSE 4000
CMD ["node", "backend/dist/all.js"]
