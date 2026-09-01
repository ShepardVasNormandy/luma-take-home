import type { FastifyBaseLogger } from "fastify";
import { runPollHandler, runSubmitHandler } from "./generation.js";
import { runStoreHandler } from "./assets.js";

type Handler = { name: string; run: () => Promise<void> };

const handlers: Handler[] = [
  { name: "generation-submit", run: runSubmitHandler },
  { name: "generation-poll", run: runPollHandler },
  { name: "asset-store", run: runStoreHandler },
];

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
