let quiet = false;

export function setQuiet(value: boolean): void {
  quiet = value;
}

export function isQuiet(): boolean {
  return quiet;
}

export const logger = {
  log: (...args: unknown[]): void => {
    if (!quiet) console.log(...args);
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
  warn: (...args: unknown[]): void => {
    if (!quiet) console.warn(...args);
  },
};
