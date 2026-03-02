import type { ServiceSchema } from "moleculer";

const service: Partial<ServiceSchema> = {
  settings: {
    rest: "/metadata",
  },
};

export default service;
