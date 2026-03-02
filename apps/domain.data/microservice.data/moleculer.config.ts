import * as path from "node:path";
import { createNodeConfig } from "core.lib/config";

export default () =>
  createNodeConfig("data", {
    servicesPath: path.join(__dirname, "services"),
  });
