/**
 * Structured logging utility for consistent error/info tracking.
 * 
 * Features:
 * - Consistent log format: [LEVEL] message {context}
 * - Sentry integration in production
 * - Debug logs only in development
 * - Structured context objects
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  bookId?: string;
  sessionId?: string;
  agentType?: string;
  workflowId?: string;
  [key: string]: unknown;
}

class Logger {
  private isDev = process.env.NODE_ENV !== 'production';
  private sentryEnabled = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

  /**
   * Debug logs - only in development
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDev) {
      console.debug(`[DEBUG] ${message}`, context || '');
    }
  }

  /**
   * Info logs - always shown
   */
  info(message: string, context?: LogContext): void {
    console.info(`[INFO] ${message}`, context || '');
  }

  /**
   * Warning logs
   */
  warn(message: string, context?: LogContext): void {
    console.warn(`[WARN] ${message}`, context || '');
  }

  /**
   * Error logs - also sends to Sentry in production
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    console.error(`[ERROR] ${message}`, {
      message: errorObj.message,
      stack: errorObj.stack,
      ...context,
    });

    // Send to Sentry in production
    if (this.sentryEnabled && process.env.NODE_ENV === 'production') {
      // The Node SDK, not the Next one: the worker shares this logger and its
      // image does not carry Next (Wave 7). On the web server the Next SDK is
      // built on the Node SDK, so this reaches the same initialised client.
      import('@sentry/node')
        .then((Sentry) => {
          Sentry.captureException(errorObj, {
            extra: context,
          });
        })
        .catch(() => {
          // Sentry not available - ignore
        });
    }
  }

  /**
   * Log API request/response
   */
  api(method: string, url: string, context?: LogContext): void {
    this.info(`API ${method} ${url}`, context);
  }

  /**
   * Log agent session events
   */
  agent(event: string, context?: LogContext): void {
    this.info(`Agent: ${event}`, context);
  }

  /**
   * Log workflow events
   */
  workflow(event: string, context?: LogContext): void {
    this.info(`Workflow: ${event}`, context);
  }
}

export const logger = new Logger();
