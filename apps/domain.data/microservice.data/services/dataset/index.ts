import type { ServiceSchema } from "moleculer";

const service: Partial<ServiceSchema> = {
  settings: {
    rest: "/datasets",
  },
};

export default service;
