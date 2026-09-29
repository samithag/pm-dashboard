FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim

WORKDIR /app/backend

RUN pip install --no-cache-dir uv

COPY backend/requirements.txt ./
RUN uv pip install --system -r requirements.txt

COPY backend/ ./

COPY --from=frontend-build /app/frontend/out /app/frontend/out

ENV DB_PATH=/app/data/kanban.db
ENV FRONTEND_DIR=/app/frontend/out
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
