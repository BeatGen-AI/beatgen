/**
 * Logger utility for consistent logging across the application
 * Provides environment-aware logging with different levels
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogContext {
  component?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: any;
}

class Logger {
  private level: LogLevel;
  private isProduction: boolean;

  constructor() {
    this.isProduction = import.meta.env.PROD;
    // In production, only log warnings and errors
    this.level = this.isProduction ? LogLevel.WARN : LogLevel.DEBUG;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;
    
    if (context?.component) {
      return `${prefix} [${context.component}] ${message}`;
    }
    
    return `${prefix} ${message}`;
  }

  private logWithContext(
    level: LogLevel,
    levelName: string,
    message: string,
    context?: LogContext,
    ...args: any[]
  ): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(levelName, message, context);
    
    // In production, we might want to send logs to a service
    if (this.isProduction && level >= LogLevel.ERROR) {
      // TODO: Send to error tracking service (Sentry, LogRocket, etc.)
    }

    // Console logging based on level
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage, ...args);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage, ...args);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage, ...args);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage, ...args);
        break;
    }

    // Log context if provided
    if (context && Object.keys(context).length > 1) { // More than just component
      console.debug('Context:', context);
    }
  }

  debug(message: string, context?: LogContext, ...args: any[]): void {
    this.logWithContext(LogLevel.DEBUG, 'DEBUG', message, context, ...args);
  }

  info(message: string, context?: LogContext, ...args: any[]): void {
    this.logWithContext(LogLevel.INFO, 'INFO', message, context, ...args);
  }

  warn(message: string, context?: LogContext, ...args: any[]): void {
    this.logWithContext(LogLevel.WARN, 'WARN', message, context, ...args);
  }

  error(message: string, context?: LogContext, error?: Error, ...args: any[]): void {
    const errorArgs = error ? [error, ...args] : args;
    this.logWithContext(LogLevel.ERROR, 'ERROR', message, context, ...errorArgs);
  }

  // Convenience methods for common use cases
  auth = {
    debug: (message: string, context?: Omit<LogContext, 'component'>) => 
      this.debug(message, { component: 'auth', ...context }),
    info: (message: string, context?: Omit<LogContext, 'component'>) => 
      this.info(message, { component: 'auth', ...context }),
    warn: (message: string, context?: Omit<LogContext, 'component'>) => 
      this.warn(message, { component: 'auth', ...context }),
    error: (message: string, context?: Omit<LogContext, 'component'>, error?: Error) => 
      this.error(message, { component: 'auth', ...context }, error),
  };

  api = {
    debug: (message: string, context?: Omit<LogContext, 'component'>) => 
      this.debug(message, { component: 'api', ...context }),
    info: (message: string, context?: Omit<LogContext, 'component'>) => 
      this.info(message, { component: 'api', ...context }),
    warn: (message: string, context?: Omit<LogContext, 'component'>) => 
      this.warn(message, { component: 'api', ...context }),
    error: (message: string, context?: Omit<LogContext, 'component'>, error?: Error) => 
      this.error(message, { component: 'api', ...context }, error),
  };

  oauth = {
    debug: (message: string, context?: Omit<LogContext, 'component'>) => 
      this.debug(message, { component: 'oauth', ...context }),
    info: (message: string, context?: Omit<LogContext, 'component'>) => 
      this.info(message, { component: 'oauth', ...context }),
    warn: (message: string, context?: Omit<LogContext, 'component'>) => 
      this.warn(message, { component: 'oauth', ...context }),
    error: (message: string, context?: Omit<LogContext, 'component'>, error?: Error) => 
      this.error(message, { component: 'oauth', ...context }, error),
  };
}

// Export singleton instance
export const logger = new Logger();

// Export default for convenient importing
export default logger;