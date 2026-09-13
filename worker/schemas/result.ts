export type Platform =
  | 'douyin'
  | 'tiktok'
  | 'xiaohongshu'
  | 'kuaishou'
  | 'bilibili'
  | 'weibo'
  | 'twitter'
  | 'instagram'
  | 'youtube'
  | 'pipixia'
  | 'pipigx'
  | 'qsmusic'
  | 'lvzhou'
  | 'huoshan'
  | 'weishi'
  | 'xigua'
  | 'zuiyou'
  | 'quanmin'
  | 'lishipin'
  | 'huya'
  | 'acfun'
  | 'meipai'
  | 'doupai'
  | 'quanminkge'
  | 'sixroom'
  | 'xinpianchang'
  | 'haokan'
  | 'unknown';

export type ContentType = 'video' | 'images' | 'audio' | 'mixed';

export interface MediaResource {
  type: 'video' | 'image' | 'audio';
  url: string;
  previewUrl?: string;
  quality?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  mime?: string;
  filename?: string;
  sizeBytes?: number;
  direct?: boolean;
  expiresAt?: string;
}

export interface ParseResult {
  success: true;
  requestId: string;
  platform: Platform;
  source: {
    url: string;
    canonicalUrl?: string;
    contentId?: string;
  };
  author?: {
    id?: string;
    name?: string;
    avatar?: string;
    url?: string;
  };
  content: {
    type: ContentType;
    title?: string;
    description?: string;
    cover?: string;
    createdAt?: string;
    duration?: number;
  };
  media: MediaResource[];
  provider: {
    id: string;
    latencyMs: number;
    fallbackChain?: string[];
  };
}

export type ErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PLATFORM'
  | 'CONTENT_NOT_FOUND'
  | 'PRIVATE_CONTENT'
  | 'COOKIE_REQUIRED'
  | 'UPSTREAM_BLOCKED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_CHANGED'
  | 'SIGNATURE_FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PARSE_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ParseError {
  success: false;
  requestId: string;
  platform?: Platform;
  error: {
    code: ErrorCode;
    message: string;
    detail?: string;
  };
}

export type ParseResponse = ParseResult | ParseError;