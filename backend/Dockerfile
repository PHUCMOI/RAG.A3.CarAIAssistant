FROM python:3.12-slim

WORKDIR /app

# Install curl for health check if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

ENV PORT=8080
ENV HOST=0.0.0.0
ENV ENVIRONMENT=production

EXPOSE 8080

CMD ["python", "run.py"]
