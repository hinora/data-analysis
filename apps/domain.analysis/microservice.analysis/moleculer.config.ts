import * as path from "node:path";
import { createNodeConfig } from "core.lib/config";

export default () =>
  createNodeConfig("analysis", {
    servicesPath: path.join(__dirname, "services"),
  });
