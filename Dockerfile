FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    SOCKETIO_ASYNC_MODE=eventlet

WORKDIR /app

# Cài dependencies trước để tận dụng cache layer
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run cấp cổng qua biến môi trường PORT (mặc định 8080)
ENV PORT=8080
EXPOSE 8080

# 1 worker + eventlet để Socket.IO (WebSocket) hoạt động chuẩn.
# eventlet tự lo concurrency cho nhiều kết nối qua green-thread.
CMD exec gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT --timeout 120 app:app
