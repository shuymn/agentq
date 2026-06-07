import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRoom } from "../src/room";

const dirs: string[] = [];

const makeDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("room resolution", () => {
  test("room id is stable across relative forms of the same cwd", () => {
    const workspace = makeDir("agentq-room-");

    const direct = resolveRoom(workspace);
    const dotted = resolveRoom(join(workspace, "."));

    expect(dotted).toEqual(direct);
  });

  test("room id is based on canonical cwd", () => {
    const workspace = makeDir("agentq-real-");
    const link = `${workspace}-link`;
    symlinkSync(workspace, link);
    dirs.push(link);

    const viaLink = resolveRoom(link);
    const viaRealPath = resolveRoom(realpathSync.native(workspace));

    expect(viaLink).toEqual(viaRealPath);
  });
});
