export interface CobaltRequestOptions {
  url: string;
  videoQuality?: 'max' | '1080' | '720' | '480' | '360';
  audioFormat?: 'best' | 'mp3' | 'ogg' | 'wav';
  downloadMode?: 'auto' | 'audio' | 'mute';
}

export interface CobaltResponse {
  status: 'tunnel' | 'redirect' | 'picker' | 'error';
  url?: string;
  filename?: string;
  picker?: Array<{
    type: 'video' | 'photo' | 'gif';
    url: string;
    thumb?: string;
  }>;
  audio?: string;
  text?: string;
  error?: {
    code?: string;
    context?: any;
  };
}

export class CobaltAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CobaltAuthError';
  }
}

export class CobaltClient {
  private endpoint: string;
  private apiKey?: string;

  constructor(endpoint: string, apiKey?: string) {
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  async parse(options: CobaltRequestOptions, signal?: AbortSignal): Promise<CobaltResponse> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'MediaFlow/1.0',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const body: Record<string, any> = { url: options.url };
    if (options.videoQuality) body.videoQuality = options.videoQuality;
    if (options.audioFormat) body.audioFormat = options.audioFormat;
    if (options.downloadMode) body.downloadMode = options.downloadMode;

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    const detail = await res.text().catch(() => '');
    let parsed: CobaltResponse | null = null;
    try {
      parsed = JSON.parse(detail) as CobaltResponse;
    } catch {
      parsed = null;
    }

    const errCode = parsed?.error?.code || '';
    if (
      res.status === 401 ||
      errCode.includes('auth') ||
      errCode.includes('jwt') ||
      errCode.includes('turnstile')
    ) {
      throw new CobaltAuthError('Cobalt 上游需要 API 密钥，公共接口已关闭免登录访问');
    }

    if (!res.ok) {
      throw new Error(`Cobalt HTTP ${res.status}`);
    }

    if (!parsed) {
      throw new Error('Cobalt 返回了无法解析的响应');
    }
    return parsed;
  }
}
