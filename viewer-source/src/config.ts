import {readBootstrap} from "./bootstrap";
import type { ModelSource } from "./types/model";

export type AppConfig = {
  accessToken: string;
  modelSource: ModelSource;
};

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function parseConfig(_env?: ImportMetaEnv): AppConfig {
  const bootstrap=readBootstrap();
  return {accessToken:'',modelSource:bootstrap.projects[0].modelSource};
}
