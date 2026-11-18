FROM node:22-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package.json ./
COPY frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.11-slim

WORKDIR /app

COPY server/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY server /app/server
COPY --from=frontend-build /frontend/dist /app/web

EXPOSE 8000

CMD ["python", "server/server.py"]
