# DeepSeek-OCR-2 OpenAI-compatible API Server
# Build: docker build -t deepseek-ocr2 .
# Run: docker run --gpus all -p 8000:8000 -v ~/.cache/huggingface:/root/.cache/huggingface deepseek-ocr2

FROM nvidia/cuda:11.8.0-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV VLLM_USE_V1=0

# Install system dependencies (Ubuntu 22.04 has Python 3.10)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Clone the repository
RUN git clone https://github.com/deepseek-ai/DeepSeek-OCR-2.git /app

# Download vLLM wheel (cp38-abi3 works with Python 3.8+)
RUN curl -LO https://github.com/vllm-project/vllm/releases/download/v0.8.5/vllm-0.8.5+cu118-cp38-abi3-manylinux1_x86_64.whl

# Use to download the local model
#COPY vllm-0.8.5+cu118-cp38-abi3-manylinux1_x86_64.whl /app/

# Install PyTorch first
RUN pip install --no-cache-dir torch==2.6.0 torchvision==0.21.0 torchaudio==2.6.0 \
    --index-url https://download.pytorch.org/whl/cu118

# Install vLLM
RUN pip install --no-cache-dir vllm-0.8.5+cu118-cp38-abi3-manylinux1_x86_64.whl \
    && rm vllm-0.8.5+cu118-cp38-abi3-manylinux1_x86_64.whl

# Install requirements
RUN pip install --no-cache-dir -r requirements.txt

# Install flash-attention (requires ninja for faster build)
RUN pip install --no-cache-dir ninja \
    && pip install --no-cache-dir flash-attn==2.7.3 --no-build-isolation

# Install additional dependencies for the server
RUN pip install --no-cache-dir fastapi uvicorn

# Set working directory to vLLM scripts
WORKDIR /app/DeepSeek-OCR2-master/DeepSeek-OCR2-vllm

# Copy the OpenAI server script
COPY ./backend/DeepSeek-OCR2-master/DeepSeek-OCR2-vllm/openai_server.py .

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Override NVIDIA entrypoint
ENTRYPOINT []
CMD ["python", "openai_server.py"]
