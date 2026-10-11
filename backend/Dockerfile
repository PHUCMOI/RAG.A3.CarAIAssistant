FROM python:3.12-slim

WORKDIR /app

# Install curl for health check if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements*.txt ./
RUN pip install --no-cache-dir torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements-rag.txt

# Copy backend code
COPY backend/ ./backend/
COPY scripts/ ./scripts/
COPY eval/ ./eval/
COPY database/ ./database/

ENV PORT=8080
ENV HOST=0.0.0.0
ENV ENVIRONMENT=production
ENV PYTHONPATH=/app/backend

EXPOSE 8080

CMD ["python", "backend/run.py"]
