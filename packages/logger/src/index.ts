import pino from 'pino'
import pretty from 'pino-pretty'

// Uses pino-pretty as a direct stream rather than pino's `transport` option:
// `transport` spawns a worker thread that resolves a file path at runtime,
// which breaks under Next.js/webpack bundling.
const stream =
  process.env.NODE_ENV !== 'production'
    ? pretty({ colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' })
    : undefined

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'error',
  },
  stream,
)

export type { Logger } from 'pino'

export function createLogger(app: string) {
  return logger.child({ app })
}
