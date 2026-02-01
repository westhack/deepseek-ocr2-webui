# DeepSeek-OCR-2 OpenAI-compatible API Server

Production Docker deployment for DeepSeek-OCR-2 with OpenAI-compatible API.

## Files

```
.
├── Dockerfile          # Production Docker image
├── openai_server.py    # Custom OpenAI-compatible API server
└── README.md           # This file
```

## Why `openai_server.py`?

DeepSeek-OCR-2 includes a native vLLM model implementation (`deepseek_ocr2.py`), but it **cannot be used directly with vLLM's built-in OpenAI server**. The issue is image preprocessing:

1. **vLLM's OpenAI server** passes raw PIL images to the model's processor
2. **DeepSeek's processor** expects images pre-processed by `tokenize_with_images()` — a custom method that handles dynamic resolution cropping, tiling, and feature extraction

When you try to use `vllm serve` directly, you get errors like:
```
TypeError: cannot unpack non-iterable Image object
TypeError: 'Image' object is not subscriptable
```

Our `openai_server.py` solves this by:
- Extracting base64 images from OpenAI-format requests
- Preprocessing them using DeepSeek's `tokenize_with_images()` method (same as their `run_dpsk_ocr2_image.py`)
- Passing the processed features to vLLM's `AsyncLLMEngine`
- Returning OpenAI-compatible responses with streaming support

This approach uses the exact same preprocessing pipeline as DeepSeek's official scripts, ensuring correct results.

## Requirements

- Docker with NVIDIA Container Toolkit
- NVIDIA GPU with CUDA 11.8+ support
- ~8GB+ VRAM (model uses ~6.3GB)

## Quick Start

### Build

```bash
docker build -t deepseek-ocr2 .
```

### Run

```bash
docker run --gpus all -p 8000:8000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  deepseek-ocr2
```

## API Usage

### List Models

```bash
curl http://localhost:8000/v1/models
```

### OCR with Layout Detection

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-ai/DeepSeek-OCR-2",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,'$(base64 -w0 image.jpg)'"}},
        {"type": "text", "text": "<|grounding|>Convert the document to markdown."}
      ]
    }],
    "max_tokens": 8192
  }'
```

### OCR without Layout (Text Only)

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-ai/DeepSeek-OCR-2",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,'$(base64 -w0 image.jpg)'"}},
        {"type": "text", "text": "Free OCR."}
      ]
    }],
    "max_tokens": 8192
  }'
```

### Remote image recognition using OCR
```
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-ai/DeepSeek-OCR-2",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "image_url", "image_url": {"url": "http://127.0.0.1/image_url.png"}} ,
        {"type": "text", "text": "<|grounding|>Convert the document to markdown."}
      ]
    }],
    "max_tokens": 8192
  }'
```

### Streaming

Add `"stream": true` to the request body for streaming responses.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GPU_MEMORY_UTILIZATION` | `0.90` | GPU memory fraction to use |
| `MAX_MODEL_LEN` | `8192` | Maximum sequence length (input + output) |
| `TENSOR_PARALLEL_SIZE` | `1` | Number of GPUs for tensor parallelism |

## Token Limits

- **Total context window**: 8192 tokens (input + output combined)
- **Visual tokens**: up to 1120 tokens per image ((0-6)×144 + 256)
- **Default max_tokens**: 8192 (will be limited by remaining context after input)
- **Practical output limit**: ~7000 tokens for typical images

## Prompts

| Prompt | Description |
|--------|-------------|
| `<\|grounding\|>Convert the document to markdown.` | OCR with layout detection (bounding boxes) |
| `Free OCR.` | Plain text extraction without layout |

## Health Check

```bash
curl http://localhost:8000/health
```

## Notes

- First request will be slow as the model loads (~30-40 seconds)
- Model weights are cached in `~/.cache/huggingface`
- Supports base64-encoded JPEG/PNG images
- Returns markdown with HTML tables for tabular content

# DeepSeek-OCR2-WebUI

A pure frontend, browser-only document processing tool that converts scanned images and multi-page PDFs into various editable formats using DeepSeek-OCR.

## 🚀 Overview

DeepSeek-OCR2-WebUI is designed to handle document conversion tasks entirely within the browser. By leveraging modern web technologies like Web Workers and IndexedDB, it provides a powerful, privacy-focused alternative to server-side document processing.

- **Frontend Only**: No backend services required (except for DeepSeek-OCR2 API).
- **Privacy First**: Documents never leave your browser for processing.
- **Large Document Support**: Optimized for hundreds of pages using virtual lists and efficient memory management.
- **Persistent State**: Progress and intermediate results survive page refreshes using IndexedDB.

## 🛠️ Technology Stack

- **Framework**: Vue 3 (Composition API)
- **Language**: TypeScript
- **UI Library**: Naive UI
- **State Management**: Pinia
- **Database**: Dexie.js (IndexedDB)
- **PDF Core**: `pdfjs-dist` (Rendering) & `pdf-lib` (Generation)
- **Converters**: `markdown-it` (Markdown) & `docx` (Word)
- **Build Tool**: Vite
- **Testing**: Vitest & Playwright
