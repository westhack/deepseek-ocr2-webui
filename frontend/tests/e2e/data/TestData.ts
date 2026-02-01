import path from 'path';
import fs from 'fs';

export const TestData = {
  // 文件路径
  files: {
    samplePDF: () => path.resolve('tests/e2e/samples/sample.pdf'),
    samplePNG: () => path.resolve('tests/e2e/samples/sample.png'),
    sampleJPG: () => path.resolve('tests/e2e/samples/sample.jpg'),
    largePDF: () => path.resolve('tests/e2e/samples/sample3.pdf'),
    sample3PDF: () => path.resolve('tests/e2e/samples/sample3.pdf'),

    // 批量文件
    multipleImages: () => [
      TestData.files.samplePNG(),
      TestData.files.sampleJPG(),
      TestData.files.samplePNG()
    ],

    pdfAndImages: () => [
      TestData.files.samplePDF(),
      TestData.files.samplePNG(),
      TestData.files.sampleJPG()
    ]
  },

  // 国际化翻译
  translations: {
    en: {
      welcomeTitle: 'DeepSeek-OCR2-WebUI',
      welcomeDescription: 'Drop PDF or Images here to start',
      startImport: 'Select Files',
      importButton: 'Import Files',
      selectFiles: 'Select Files',
      pageCounter: (n: number) => `${n} pages`,
      scanToDocument: 'Scan to Document',
      deletePage: 'Delete page',
      selectAPage: 'Select a page to view',
      status: 'Status:',
      ready: 'Ready',
      fit: 'Fit',
      downloadMD: 'Download MD'
    },
    'zh-CN': {
      welcomeTitle: 'DeepSeek-OCR2-WebUI',
      welcomeDescription: '拖放 PDF 或图片到此处开始',
      startImport: '选择文件',
      importButton: '导入文件',
      selectFiles: '选择文件',
      pageCounter: (n: number) => `共 ${n} 页`,
      scanToDocument: '扫描为文档',
      deletePage: '删除页面',
      selectAPage: '选择一个页面查看',
      status: '状态:',
      ready: '就绪',
      fit: '适应',
      downloadMD: '下载 MD'
    },
    'zh-TW': {
      welcomeTitle: 'DeepSeek-OCR2-WebUI',
      welcomeDescription: '拖放 PDF 或圖片到此處開始',
      startImport: '選擇文件',
      importButton: '導入文件',
      selectFiles: '選擇文件',
      pageCounter: (n: number) => `共 ${n} 頁`,
      scanToDocument: '掃描為文檔',
      deletePage: '刪除頁面',
      selectAPage: '選擇一個頁面查看',
      status: '狀態:',
      ready: '就緒',
      fit: '適應',
      downloadMD: '下載 MD'
    },
    'ja-JP': {
      welcomeTitle: 'DeepSeek-OCR2-WebUI',
      welcomeDescription: 'PDFまたは画像をここにドロップして開始',
      startImport: 'ファイルを選択',
      importButton: 'ファイルをインポート',
      selectFiles: 'ファイルを選択',
      pageCounter: (n: number) => `全 ${n} ページ`,
      scanToDocument: 'ドキュメントへスキャン',
      deletePage: 'ページを削除',
      selectAPage: '表示するページを選択',
      status: 'ステータス:',
      ready: '準備完了',
      fit: 'フィット',
      downloadMD: 'MD をダウンロード'
    }
  },

  // OCR 响应数据
  ocrResponse: {
    default: () => {
      const responsePath = path.resolve('tests/e2e/samples/sample.json');
      if (fs.existsSync(responsePath)) {
        return JSON.parse(fs.readFileSync(responsePath, 'utf-8'));
      }
      // 返回默认的 OCR 响应结构
      return {
        regions: [
          {
            lines: [
              {
                words: [
                  { text: 'Sample', confidence: 0.95 }
                ]
              }
            ]
          }
        ]
      };
    }
  },

  // 导出配置
  exportFormats: [
    {
      type: 'Markdown',
      extension: 'md',
      dropdownText: 'Export as Markdown',
      validation: {
        contentPattern: /瑞慈/g,
        expectedMatches: 4
      }
    },
    {
      type: 'DOCX',
      extension: 'docx',
      dropdownText: 'Export as DOCX',
      validation: {
        xmlPath: 'word/document.xml',
        contentPattern: /1021112511173001/g,
        expectedMatches: 2
      }
    },
    {
      type: 'PDF',
      extension: 'pdf',
      dropdownText: 'Export as PDF',
      validation: {
        expectedPageCount: 2
      }
    }
  ] as const,

  // 页面状态
  pageStatuses: {
    ready: ['ready'],
    processing: ['pending_render', 'rendering'],
    ocrQueue: ['pending_ocr', 'recognizing'],
    ocrComplete: [
      'ocr_success',
      'pending_gen',
      'generating_markdown',
      'markdown_success',
      'generating_pdf',
      'pdf_success',
      'generating_docx',
      'completed'
    ]
  } as const
};
