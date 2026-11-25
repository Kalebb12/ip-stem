# SenseAtlas API. Build from the repository root so the sample lecture is included:
#   docker build -f api/Dockerfile -t senseatlas-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/data PORT=8000

WORKDIR /app/api
COPY api/requirements.txt .
RUN pip install --timeout 300 -r requirements.txt

# seed.py looks for ../samples/heart-lecture.pdf to create the demo lesson
COPY samples /app/samples
COPY api/app ./app

RUN useradd --create-home appuser && mkdir -p /data && chown appuser /data
USER appuser
VOLUME ["/data"]
EXPOSE 8000

# One worker on purpose: SQLite, background processing jobs and audio tickets live in this process.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
