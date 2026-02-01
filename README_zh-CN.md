
# DeepSeek-OCR-2 OpenAI 兼容 API 服务器

DeepSeek-OCR-2 的生产环境 Docker 部署，提供 OpenAI 兼容的 API。

## 文件结构

```
.
├── Dockerfile          # 生产环境 Docker 镜像
├── openai_server.py    # 自定义 OpenAI 兼容 API 服务器
└── README.md           # 本文件
```

## 为什么需要 `openai_server.py`？

DeepSeek-OCR-2 自带原生 vLLM 模型实现 (`deepseek_ocr2.py`)，但 **不能直接使用 vLLM 自带的 OpenAI 服务器**，原因在于图像预处理：

1. **vLLM 的 OpenAI 服务器** 会将原始 PIL 图像传给模型处理器
2. **DeepSeek 的处理器** 需要图像先经过 `tokenize_with_images()` 方法处理 —— 该方法会进行动态分辨率裁剪、切片和特征提取

如果直接使用 `vllm serve`，会报错，例如：

```
TypeError: cannot unpack non-iterable Image object
TypeError: 'Image' object is not subscriptable
```

我们的 `openai_server.py` 解决方法是：

* 从 OpenAI 格式请求中提取 base64 图像
* 使用 DeepSeek 的 `tokenize_with_images()` 方法进行预处理（与官方脚本 `run_dpsk_ocr2_image.py` 一致）
* 将处理后的特征传入 vLLM 的 `AsyncLLMEngine`
* 返回 OpenAI 兼容响应，并支持流式输出

这种方式使用与 DeepSeek 官方脚本完全相同的预处理流程，保证结果正确。

## 环境要求

* 安装 Docker 并配置 NVIDIA Container Toolkit
* NVIDIA GPU，CUDA 版本 11.8+
* 显存 ≥ 8GB（模型约占用 6.3GB）

## 快速开始

### 构建镜像

```bash
docker build -t deepseek-ocr2 .
```

### 运行容器

```bash
docker run --gpus all -p 8000:8000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  deepseek-ocr2
```

## API 使用

### 列出模型

```bash
curl http://localhost:8000/v1/models
```

### 带布局识别的 OCR

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-ai/DeepSeek-OCR-2",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,'$(base64 -w0 image.jpg)'"}} ,
        {"type": "text", "text": "<|grounding|>Convert the document to markdown."}
      ]
    }],
    "max_tokens": 8192
  }'
```

### 仅文本 OCR（不保留布局）

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-ai/DeepSeek-OCR-2",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,'$(base64 -w0 image.jpg)'"}} ,
        {"type": "text", "text": "Free OCR."}
      ]
    }],
    "max_tokens": 8192
  }'
```

### 远程图片识别的 OCR
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

### 流式输出

在请求体中添加 `"stream": true` 即可启用流式响应。

## 环境变量

| 变量                       | 默认值    | 描述              |
| ------------------------ | ------ | --------------- |
| `GPU_MEMORY_UTILIZATION` | `0.90` | 使用的 GPU 显存比例    |
| `MAX_MODEL_LEN`          | `8192` | 最大序列长度（输入 + 输出） |
| `TENSOR_PARALLEL_SIZE`   | `1`    | 张量并行的 GPU 数量    |

## Token 限制

* **总上下文窗口**：8192 tokens（输入 + 输出总和）
* **视觉 tokens**：每张图像最多 1120 tokens ((0-6)×144 + 256)
* **默认 max_tokens**：8192（受输入上下文限制）
* **实际输出限制**：典型图像约 7000 tokens

## Prompt 示例

| 提示词                                                | 说明                |
|----------------------------------------------------|-------------------|
| `<\|grounding\|>Convert the document to markdown.` | OCR + 布局检测（包含边界框） |
| `Free OCR.`                                        | 仅提取纯文本，不保留布局      |

## 健康检查

```bash
curl http://localhost:8000/health
```

## 注意事项

* 第一次请求会较慢，因为模型需要加载（约 30-40 秒）
* 模型权重缓存于 `~/.cache/huggingface`
* 支持 base64 编码的 JPEG / PNG 图像
* 表格内容会返回 Markdown 格式 + HTML 表格


# DeepSeek-OCR2-WebUI

一个纯前端、仅限浏览器的文档处理工具，利用 DeepSeek-OCR2 将扫描图像和多页 PDF 转换为 Markdown, DOCX, PDF等多种可编辑格式。

## 🚀 概览

DeepSeek-OCR2-WebUI 旨在完全在浏览器内处理文档转换任务。通过利用 Web Workers 和 IndexedDB 等现代 Web 技术，它提供了一个功能强大、注重隐私的替代方案，取代了服务器端文档处理。

- **仅限前端**：无需后端服务（除了调用 DeepSeek-OCR2 API）。
- **隐私至上**：文档处理过程中绝不会离开您的浏览器。
- **支持大文档**：通过虚拟列表和高效的内存管理，针对数百页文档进行了优化。
- **状态持久化**：利用 IndexedDB，任务进度和中间结果在页面刷新后依然存在。

## 🛠️ 技术栈

- **框架**: Vue 3 (Composition API)
- **语言**: TypeScript
- **UI 库**: Naive UI
- **状态管理**: Pinia
- **数据库**: Dexie.js (IndexedDB)
- **PDF 核心**: `pdfjs-dist` (渲染) & `pdf-lib` (生成)
- **转换器**: `markdown-it` (Markdown) & `docx` (Word)
- **构建工具**: Vite
- **测试**: Vitest & Playwright
