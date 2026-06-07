import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { ARTIFACTS_DIRNAME } from "./constants";
import { AgentQError } from "./errors";

export type ArtifactKind = "user" | "combined";

export interface StoredArtifactInput {
  id: string;
  kind: ArtifactKind;
  sourcePath: string | null;
  storedPath: string;
  metadataJson: string | null;
}

export class ArtifactStore {
  readonly rootDir: string;

  constructor(dataDir: string) {
    this.rootDir = join(dataDir, ARTIFACTS_DIRNAME);
  }

  copyUserArtifact(roomId: string, sourcePath: string): StoredArtifactInput {
    const id = randomUUID();
    let canonicalSource: string;
    try {
      canonicalSource = realpathSync.native(sourcePath);
    } catch (error) {
      if (isNodeErrorCode(error, "ENOENT")) {
        throw new AgentQError("artifact-not-found", `Artifact path was not found: ${sourcePath}`);
      }
      throw filesystemError(`Could not resolve artifact path: ${sourcePath}`, error);
    }
    const extension = extname(canonicalSource);
    const safeName = `${id}-${sanitizeFilename(basename(canonicalSource, extension))}${extension}`;
    const storedPath = join(this.roomArtifactDir(roomId), safeName);
    try {
      copyFileSync(canonicalSource, storedPath);
    } catch (error) {
      throw filesystemError(`Could not copy artifact to store: ${canonicalSource}`, error);
    }
    return {
      id,
      kind: "user",
      sourcePath: canonicalSource,
      storedPath,
      metadataJson: null,
    };
  }

  writeCombinedArtifact(roomId: string, assignmentId: string, value: unknown): StoredArtifactInput {
    const id = randomUUID();
    const storedPath = join(this.roomArtifactDir(roomId), `combined-${assignmentId}-${id}.json`);
    try {
      writeFileSync(storedPath, `${JSON.stringify(value, null, 2)}\n`);
    } catch (error) {
      throw filesystemError(`Could not write combined artifact: ${storedPath}`, error);
    }
    return {
      id,
      kind: "combined",
      sourcePath: null,
      storedPath,
      metadataJson: JSON.stringify({ assignmentId }),
    };
  }

  removeRoomArtifacts(roomId: string) {
    const directory = join(this.rootDir, roomId);
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      throw filesystemError(`Could not remove room artifacts: ${directory}`, error);
    }
  }

  private roomArtifactDir(roomId: string) {
    const directory = join(this.rootDir, roomId);
    try {
      mkdirSync(directory, { recursive: true });
    } catch (error) {
      throw filesystemError(`Could not create artifact directory: ${directory}`, error);
    }
    return directory;
  }
}

const sanitizeFilename = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, "_") || "artifact";

const filesystemError = (message: string, cause: unknown) =>
  new AgentQError(
    "filesystem-error",
    cause instanceof Error ? `${message}: ${cause.message}` : message,
  );

const isNodeErrorCode = (error: unknown, code: string) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === code;
