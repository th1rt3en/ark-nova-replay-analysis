FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 WEB_DIR=/app/web
WORKDIR /app

COPY pyproject.toml ./
COPY src ./src
COPY web ./web
RUN pip install --no-cache-dir ".[gcp]"

RUN useradd --create-home appuser
USER appuser

# Cloud Run provides $PORT
CMD ["sh", "-c", "exec uvicorn ark_nova.api.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
