import { homedir } from "node:os";
import { join } from "node:path";

export const AGENTQ_DATA_DIR_ENV = "AGENTQ_DATA_DIR";
export const AGENTQ_TOKEN_ENV = "AGENTQ_TOKEN";
export const AGENTQ_INSTANCE_ID_ENV = "AGENTQ_INSTANCE_ID";
export const AGENTQ_ROOM_ID_ENV = "AGENTQ_ROOM_ID";
export const AGENTQ_ROLE_ENV = "AGENTQ_ROLE";
export const AGENTQ_BIN_ENV = "AGENTQ_BIN";

export const DATABASE_FILENAME = "agentq.sqlite";
export const ARTIFACTS_DIRNAME = "artifacts";
export const ROOM_ID_HASH_LENGTH = 32;
export const ROLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const DEFAULT_DATA_DIR = join(homedir(), ".local", "share", "agentq");

export const getDataDir = (env: Record<string, string | undefined> = process.env) =>
  env[AGENTQ_DATA_DIR_ENV] ?? DEFAULT_DATA_DIR;
