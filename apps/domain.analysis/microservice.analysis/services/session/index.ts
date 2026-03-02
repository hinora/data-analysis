import type { ServiceSchema } from "moleculer";

const service: Partial<ServiceSchema> = {
  settings: {
    rest: "/sessions",
  },
};

export default service;
