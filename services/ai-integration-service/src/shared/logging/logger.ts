export interface Logger {
  info(event: string, context?: Record<string, unknown>): void;
  warn(event: string, context?: Record<string, unknown>): void;
  error(event: string, context?: Record<string, unknown>): void;
}

function write(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown> = {}): void {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'ai-integration-service',
    event,
    ...context,
  });

  if (level === 'error') console.error(record);
  else if (level === 'warn') console.warn(record);
  else console.log(record);
}

export const logger: Logger = {
  info: (event, context) => write('info', event, context),
  warn: (event, context) => write('warn', event, context),
  error: (event, context) => write('error', event, context),
};
