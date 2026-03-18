import type { ServiceSchema } from "moleculer";

const service: Partial<ServiceSchema> = {
  settings: {
    rest: "/auth",
  },
};

export default service;
