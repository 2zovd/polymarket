import pino from 'pino';

// Structured logger singleton.
// JSON output in production; pino-pretty in dev when LOG_PRETTY=true.
// Usage: const log = logger.child({ module: 'clob' });

const logLevel = process.env.LOG_LEVEL ?? 'info';
const usePretty = process.env.LOG_PRETTY === 'true';

export const logger = pino(
  {
    level: logLevel,
    base: { pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  usePretty
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      })
    : undefined,
);
