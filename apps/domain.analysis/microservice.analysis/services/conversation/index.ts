import type { ServiceSchema } from "moleculer";

const service: Partial<ServiceSchema> = {
  settings: {
    rest: "/conversations",
  },
};

export default service;
