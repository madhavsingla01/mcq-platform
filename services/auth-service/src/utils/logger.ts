/**
 * Logger utility with timestamps and colored levels.
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const timestamp = () => {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
};

export const logger = {
  info: (...args: unknown[]) => {
    console.log(`${colors.gray}[${timestamp()}]${colors.reset} ${colors.green}INFO${colors.reset}`, ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(`${colors.gray}[${timestamp()}]${colors.reset} ${colors.yellow}WARN${colors.reset}`, ...args);
  },
  error: (...args: unknown[]) => {
    console.error(`${colors.gray}[${timestamp()}]${colors.reset} ${colors.red}ERROR${colors.reset}`, ...args);
  },
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`${colors.gray}[${timestamp()}]${colors.reset} ${colors.magenta}DEBUG${colors.reset}`, ...args);
    }
  },
  request: (method: string, url: string, status: number, duration: number) => {
    const color = status >= 400 ? colors.red : status >= 300 ? colors.yellow : colors.green;
    console.log(
      `${colors.gray}[${timestamp()}]${colors.reset} ${colors.cyan}${method}${colors.reset} ${url} ${color}${status}${colors.reset} ${colors.gray}${duration}ms${colors.reset}`
    );
  },
};

export default logger;
