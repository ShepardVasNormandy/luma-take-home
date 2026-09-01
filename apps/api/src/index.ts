import { buildServer } from "./server.js";
import { config } from "./config.js";
import { startWorker } from "./worker/index.js";

const app = buildServer();

app
  .listen({ port: config.PORT, host: "0.0.0.0" })
  .then(() => startWorker(app.log))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
