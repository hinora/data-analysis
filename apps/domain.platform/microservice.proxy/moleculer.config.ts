import { createNodeConfig } from "core.lib/config";
// biome-ignore lint/style/useNodejsImportProtocol: ignore
import * as path from "path";

export default () =>
  createNodeConfig("proxy", {
    servicesPath: path.join(__dirname, "services"),
    metadata: { service: "proxy", version: "1.0.0" },
  });
