import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { ROOM_ID_HASH_LENGTH } from "./constants";

export interface RoomReference {
  id: string;
  canonicalCwd: string;
}

export const canonicalizeCwd = (cwd = process.cwd()) => realpathSync.native(resolve(cwd));

export const roomIdForCanonicalCwd = (canonicalCwd: string) =>
  createHash("sha256").update(canonicalCwd).digest("hex").slice(0, ROOM_ID_HASH_LENGTH);

export const resolveRoom = (cwd = process.cwd()): RoomReference => {
  const canonicalCwd = canonicalizeCwd(cwd);
  return {
    id: roomIdForCanonicalCwd(canonicalCwd),
    canonicalCwd,
  };
};
