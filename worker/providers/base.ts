import type { Platform, ContentType, MediaResource } from '../schemas/result';

export interface ProviderContext {
  signal: AbortSignal;
  requestId: string;
  cookies?: {
    douyin?: string;
    bilibili?: string;
    weibo?: string;
  };
  env: Record<string, any>;
}

export interface ProviderParseInput {
  url: URL;
  platform: Platform;
  contentId?: string;
  rawInput: string;
}

export interface ProviderRawResult {
  platform: Platform;
  sourceUrl: string;
  canonicalUrl?: string;
  contentId?: string;
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
}

export interface MediaProvider {
  readonly id: string;
  readonly name: string;
  readonly platforms: Platform[];

  supports(platform: Platform, url?: URL): boolean;

  parse(
    input: ProviderParseInput,
    context: ProviderContext
  ): Promise<ProviderRawResult>;
}