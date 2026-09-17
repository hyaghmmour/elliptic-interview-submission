/**
 * Minimal stderr spinner — no dependencies, and silent-degrading: when stderr
 * is not a TTY (CI, pipes) it prints plain start/finish lines instead of
 * animating, so logs stay clean.
 */

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

/** Starts the spinner; call the returned function to stop it with a ✔ line. */
export function startSpinner(message: string): (finalMessage: string) => void {
  const stream = process.stderr;

  if (!stream.isTTY) {
    stream.write(`${message}…\n`);
    return (finalMessage) => stream.write(`✔ ${finalMessage}\n`);
  }

  let frame = 0;
  const render = () => {
    stream.clearLine(0);
    stream.cursorTo(0);
    stream.write(`${FRAMES[frame++ % FRAMES.length]} ${message}`);
  };
  const timer = setInterval(render, INTERVAL_MS);
  render();

  // Integrations log warnings straight to console.error; intercept them while
  // spinning so each lands on its own line above the spinner instead of
  // colliding with the animation.
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    stream.clearLine(0);
    stream.cursorTo(0);
    originalError(...args);
    render();
  };

  return (finalMessage) => {
    clearInterval(timer);
    console.error = originalError;
    stream.clearLine(0);
    stream.cursorTo(0);
    stream.write(`✔ ${finalMessage}\n`);
  };
}
