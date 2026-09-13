import type { ErrorCode, ParseError, Platform } from '../schemas/result';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isRetryable: boolean;
  public readonly platform?: Platform;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      statusCode?: number;
      isRetryable?: boolean;
      platform?: Platform;
    }
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.platform = options?.platform;
    this.statusCode = options?.statusCode ?? this.getDefaultStatusCode(code);
    this.isRetryable = options?.isRetryable ?? this.getDefaultRetryable(code);
  }

  private getDefaultStatusCode(code: ErrorCode): number {
    switch (code) {
      case 'INVALID_URL':
      case 'UNSUPPORTED_PLATFORM':
        return 400;
      case 'COOKIE_REQUIRED':
        return 401;
      case 'PRIVATE_CONTENT':
        return 403;
      case 'CONTENT_NOT_FOUND':
        return 404;
      case 'RATE_LIMITED':
        return 429;
      case 'UPSTREAM_TIMEOUT':
        return 504;
      case 'PROVIDER_UNAVAILABLE':
        return 503;
      case 'UPSTREAM_BLOCKED':
      case 'UPSTREAM_CHANGED':
      case 'SIGNATURE_FAILED':
      case 'PARSE_FAILED':
      case 'INTERNAL_ERROR':
      default:
        return 502;
    }
  }

  private getDefaultRetryable(code: ErrorCode): boolean {
    switch (code) {
      case 'UPSTREAM_TIMEOUT':
      case 'UPSTREAM_BLOCKED':
      case 'UPSTREAM_CHANGED':
      case 'SIGNATURE_FAILED':
      case 'PROVIDER_UNAVAILABLE':
      case 'PARSE_FAILED':
        return true;
      case 'INVALID_URL':
      case 'UNSUPPORTED_PLATFORM':
      case 'CONTENT_NOT_FOUND':
      case 'PRIVATE_CONTENT':
      case 'COOKIE_REQUIRED':
      case 'RATE_LIMITED':
      default:
        return false;
    }
  }

  toResponse(requestId: string): ParseError {
    return {
      success: false,
      requestId,
      platform: this.platform,
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}