import app from "./app";
import { env } from "./config/env";
import { startSessionCleanup } from "./services/session-cleanup.service";

const PORT = env.PORT;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  startSessionCleanup();
});
