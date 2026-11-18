const ts = () => new Date().toISOString();

export const log = {
  info: (msg: string, ...rest: unknown[]) => console.log(`${ts()} INFO  ${msg}`, ...rest),
  error: (msg: string, ...rest: unknown[]) => console.error(`${ts()} ERROR ${msg}`, ...rest),
};
