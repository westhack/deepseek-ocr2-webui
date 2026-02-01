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

## ✨ Key Features

- **PDF to Image**: High-performance conversion of PDF pages to images using Web Workers.
- **DeepSeek-OCR2 Integration**: Integration with DeepSeek-OCR2 API for text and image recognition.
- **Multi-Format Export**:
  - Markdown
  - DOCX (Microsoft Word)
  - Text+Image PDF (Searchable PDF)
- **Task Management**: Resumable and cancellable long-running tasks with real-time progress reporting.
- **Page-Centric Design**: Individual page management with independent status and logs.

## 📦 Getting Started

### Prerequisites

- **Node.js**: Required versions are `^20.19.0`, `^22.13.0`, or `>=24.0.0` (Latest LTS recommended).
  - If you encounter `EBADENGINE` errors or are on an older version (e.g., Node 18), we recommend using [nvm](https://github.com/nvm-sh/nvm) to manage your Node.js versions:
    ```bash
    # Install/Use Node 22 (LTS)
    nvm install 22
    nvm use 22
    nvm alias default 22
    ```
- **npm**: v9 or higher is recommended.

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Testing

```bash
# Run unit tests
npm run test:unit

# Run UI tests with Vitest UI
npm run test:ui

# Run E2E tests
npm run test:e2e

# Run stability tests
npm run test:e2e:quick-stability  # Quick verification (10 times)
npm run test:e2e:stability        # Full verification (50 times)

# Generate test report
npm run test:e2e:report
```

## 🏗️ Architecture Principles

- **State-Driven UI**: UI accurately reflects the underlying data state.
- **Explicit Task States**: Clear lifecycle management (idle / processing / success / error).
- **Responsive UI**: Offloading heavy computations to Web Workers to keep the main thread fluid.
- **Observability**: Centralized logging using `consola` for easier debugging and monitoring.

## 📄 License



This project is licensed under the MIT License.


