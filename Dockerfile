FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
COPY data ./data
RUN cd frontend && npm run build

FROM python:3.13-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8765

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && addgroup --system limiar \
    && adduser --system --ingroup limiar --home /app limiar

COPY --from=frontend-build /app/dist ./dist
COPY alembic.ini ./
COPY backend ./backend
COPY scripts ./scripts
COPY data ./data
COPY assets ./assets
COPY vendor ./vendor
COPY server.py ./
RUN mkdir -p /app/uploads \
    && chown -R limiar:limiar /app/uploads

USER limiar
EXPOSE 8765
CMD ["python", "server.py"]
