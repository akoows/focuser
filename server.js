import "dotenv/config";
import { createApp } from "./src/app.js";
import { parseApiConfig } from "./src/config/env.js";

const config = parseApiConfig();
const app = createApp(config);

app.listen(config.port, () => {
    console.log(`Focuser API listening on port ${config.port} (${config.nodeEnv}).`);
});
