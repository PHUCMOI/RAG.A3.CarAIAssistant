# AutoWise Image Retrieval Microservice (Thành viên 3)
# Base image: Python 3.12 slim
FROM python:3.12-slim

# Ngăn Python tạo bytecode .pyc và bật unbuffered log
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    INDEXES_DIR=/app/image_service/indexes \
    DATA_DIR=/app/image_service/data \
    DATASET_DIR=/app/dataset

WORKDIR /app

# Cài đặt curl phục vụ container healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt dependencies
COPY image_service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ gói dịch vụ khép kín của Thành viên 3
COPY image_service/ /app/image_service/
COPY dataset/ /app/dataset/

# Cổng lắng nghe
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Khởi chạy dịch vụ FastAPI
CMD ["uvicorn", "image_service.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
