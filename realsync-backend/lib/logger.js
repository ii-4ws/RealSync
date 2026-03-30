/**
 * Structured logging utility.
 *
 * Outputs JSON-formatted log lines with timestamp, level, component, and message.
 * Configurable via LOG_LEVEL env var (debug | info | warn | error). Default: info.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function emit(level, component, message, extra) {
  if (LEVELS[level] < currentLevel) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    msg: message,
  };
  if (extra !== undefined) {
    entry.extra = extra instanceof Error
      ? { message: extra.message, stack: extra.stack }
      : extra;
  }

  const replacer = (key, value) => {
    if (value instanceof Error) {
      return { message: value.message, stack: value.stack, ...value };
    }
    return value;
  };
  const line = JSON.stringify(entry, replacer);

  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

module.exports = {
  debug: (component, message, extra) => emit("debug", component, message, extra),
  info: (component, message, extra) => emit("info", component, message, extra),
  warn: (component, message, extra) => emit("warn", component, message, extra),
  error: (component, message, extra) => emit("error", component, message, extra),
};
