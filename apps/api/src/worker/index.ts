import type { FastifyBaseLogger } from "fastify";

type Handler = { name: string; run: () => Promise<void> };

// Handlers arrive with T06 (submit, poll) and T07 (store).
const handlers: Handler[] = [];

export function startWorker(log: FastifyBaseLogger, intervalMs = 4000) {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const handler of handlers) {
        try {
          await handler.run();
        } catch (err) {
          log.error({ err, handler: handler.name }, "worker handler failed");
        }
      }
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref();
  log.info({ intervalMs, handlers: handlers.length }, "worker started");
  return () => clearInterval(timer);
}
