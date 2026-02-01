import type { Page, Route } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export class APIMocks {
  constructor(private page: Page) { }

  /**
   * Mock OCR API
   * @param options - Mock 配置选项
   */
  async mockOCR(options: {
    delay?: number;
    response?: object;
    shouldFail?: boolean;
    statusCode?: number;
    rateLimitType?: 'queue_full' | 'client_limit' | 'ip_limit';
  } = {}) {
    const {
      delay = 0,
      response,
      shouldFail = false,
      statusCode = shouldFail ? 500 : 200,
      rateLimitType
    } = options;

    await this.page.route('**/ocr', async (route: Route) => {
      // 模拟网络延迟
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // 模拟速率限制 (429)
      if (rateLimitType) {
        const detailMessages = {
          queue_full: 'queue full',
          client_limit: 'Client at max',
          ip_limit: 'IP at max'
        };
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ detail: detailMessages[rateLimitType] })
        });
        return;
      }

      // 模拟失败
      if (shouldFail) {
        await route.fulfill({
          status: statusCode,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'OCR service unavailable' })
        });
        return;
      }

      // 使用默认或自定义响应
      const mockResponse = response || this.loadDefaultOCRResponse();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse)
      });
    });
  }

  /**
   * Mock Health API
   * @param options - Health Mock 配置
   */
  async mockHealth(options: {
    status: 'healthy' | 'busy' | 'full' | 'unhealthy';
    delay?: number;
    shouldFail?: boolean;
    queueInfo?: {
      depth: number;
      max_size: number;
      is_full: boolean;
    };
    rateLimits?: {
      max_per_client: number;
      max_per_ip: number;
      active_clients: number;
      active_ips: number;
    };
    yourQueueStatus?: {
      client_id: string;
      position: number | null;
      total_queued: number;
    };
  } = { status: 'healthy' }) {
    const { status, delay = 0, shouldFail = false, queueInfo, rateLimits, yourQueueStatus } = options;

    await this.page.route('**/health', async (route: Route) => {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      if (shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' })
        });
        return;
      }

      const mockResponse: Record<string, unknown> = {
        status: status,
        backend: 'mock-backend',
        platform: 'mock-platform',
        model_loaded: true
      };

      if (queueInfo) mockResponse.ocr_queue = queueInfo;
      if (rateLimits) mockResponse.rate_limits = rateLimits;
      if (yourQueueStatus) mockResponse.your_queue_status = yourQueueStatus;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse)
      });
    });
  }

  /**
   * Mock OCR API 带延迟控制(用于复杂测试场景)
   * @param completeFlag - 控制 Mock 完成的标志对象
   */
  async mockOCRWithControl(completeFlag: { value: boolean }) {
    await this.page.route('**/ocr', async (route: Route) => {
      // 等待 flag 变为 true
      while (!completeFlag.value) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const mockResponse = this.loadDefaultOCRResponse();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse)
      });
    });
  }

  /**
   * 移除所有 OCR mocks
   */
  async unmockOCR() {
    await this.page.unroute('**/ocr');
  }

  /**
   * 加载默认 OCR 响应
   */
  private loadDefaultOCRResponse(): object {
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
                { text: 'Sample Text', confidence: 0.95 }
              ]
            }
          ]
        }
      ]
    };
  }

  /**
   * Mock 字体文件请求
   */
  async mockFonts() {
    await this.page.route('**/standard_fonts/**', async (route) => {
      const url = new URL(route.request().url());
      const filePath = path.join(process.cwd(), 'public', url.pathname);

      if (fs.existsSync(filePath)) {
        await route.fulfill({
          status: 200,
          body: fs.readFileSync(filePath),
        });
      } else {
        await route.continue();
      }
    });
  }

  /**
   * Mock OCR API with Client ID validation
   * @param onValidate - Callback function to validate client ID
   */
  async mockOCRWithClientIdValidation(
    onValidate: (clientId: string | null) => void
  ) {
    await this.page.route('**/ocr', async (route: Route) => {
      const headers = route.request().headers();
      const clientId = headers['x-client-id'] || null;
      onValidate(clientId); // Call validation callback

      const mockResponse = this.loadDefaultOCRResponse();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse)
      });
    });
  }

  /**
   * Mock 导出 API
   */
  async mockExport(options: {
    shouldFail?: boolean;
    statusCode?: number;
  } = {}) {
    const { shouldFail = false, statusCode = shouldFail ? 500 : 200 } = options;

    await this.page.route('**/export/**', async (route: Route) => {
      if (shouldFail) {
        await route.fulfill({
          status: statusCode,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Export failed' })
        });
        return;
      }

      await route.continue();
    });
  }
}
