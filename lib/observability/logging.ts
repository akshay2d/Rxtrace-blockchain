// PHASE-7: Structured logging utilities
// Provides consistent, structured logging with context across the application

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  companyId?: string;
  route?: string;
  method?: string;
  operation?: string;
  resourceType?: string;
  resourceId?: string;
  [key: string]: any;
}

/**
 * PHASE-7: Structured logging with context
 * Logs messages with consistent format including timestamp, level, message, and context
 */
export function logWithContext(
  level: LogLevel,
  message: string,
  context: LogContext = {}
): void {
  const logEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  
  // PHASE-7: Use appropriate log level
  switch (level) {
    case 'error':
      console.error(`[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`, logEntry);
      break;
    case 'warn':
      console.warn(`[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`, logEntry);
      break;
    case 'debug':
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        console.debug(`[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`, logEntry);
      }
      break;
    default:
      console.log(`[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`, logEntry);
  }
}

/**
 * PHASE-7: Log info message
 */
export function logInfo(message: string, context?: LogContext): void {
  logWithContext('info', message, context);
}

/**
 * PHASE-7: Log warning message
 */
export function logWarn(message: string, context?: LogContext): void {
  logWithContext('warn', message, context);
}

/**
 * PHASE-7: Log error message
 */
export function logError(message: string, context?: LogContext): void {
  logWithContext('error', message, context);
}

/**
 * PHASE-7: Log debug message (only in development/test)
 */
export function logDebug(message: string, context?: LogContext): void {
  logWithContext('debug', message, context);
}
