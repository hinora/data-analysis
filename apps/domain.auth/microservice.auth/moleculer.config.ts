import * as path from "node:path";
import { createNodeConfig } from "core.lib/config";

export default () =>
  createNodeConfig("auth", {
    servicesPath: path.join(__dirname, "services"),
  });
