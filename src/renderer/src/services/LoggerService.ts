type LogArgs = readonly unknown[]

export class LoggerService {
  constructor(private readonly context = '') {}

  withContext(context: string): LoggerService {
    return new LoggerService(context)
  }

  private prefix(message: string): string {
    return this.context ? `[${this.context}] ${message}` : message
  }

  error(message: string, ...args: LogArgs): void {
    console.error(this.prefix(message), ...args)
  }

  warn(message: string, ...args: LogArgs): void {
    console.warn(this.prefix(message), ...args)
  }

  info(message: string, ...args: LogArgs): void {
    console.info(this.prefix(message), ...args)
  }

  verbose(message: string, ...args: LogArgs): void {
    if (import.meta.env.DEV) console.debug(this.prefix(message), ...args)
  }

  debug(message: string, ...args: LogArgs): void {
    if (import.meta.env.DEV) console.debug(this.prefix(message), ...args)
  }

  silly(message: string, ...args: LogArgs): void {
    if (import.meta.env.DEV) console.debug(this.prefix(message), ...args)
  }
}

export const loggerService = new LoggerService()
