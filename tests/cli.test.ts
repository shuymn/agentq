import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../src/cli";
import { AGENTQ_TOKEN_ENV } from "../src/constants";
import { AgentQueueStore } from "../src/store";

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

const run = (
  args: string[],
  options?: {
    cwd?: string;
    dataDir?: string;
    env?: Record<string, string>;
  },
) => {
  const dataDir = options?.dataDir ?? makeDir("agentq-cli-data-");
  const cwd = options?.cwd ?? makeDir("agentq-cli-workspace-");
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return runCli({
    argv: args,
    cwd,
    env: {
      ...process.env,
      AGENTQ_DATA_DIR: dataDir,
      ...options?.env,
    },
    stdout: { log: (msg: string) => stdoutLines.push(msg) },
    stderr: { error: (msg: string) => stderrLines.push(msg) },
  }).then((code) => ({
    code,
    cwd,
    dataDir,
    stdout: stdoutLines.join("\n"),
    stderr: stderrLines.join("\n"),
  }));
};

describe("agentq CLI", () => {
  test("join succeeds once and duplicate join fails", async () => {
    const dataDir = makeDir("agentq-cli-data-");
    const cwd = makeDir("agentq-cli-workspace-");

    const first = await run(["join", "--as", "codex"], { cwd, dataDir });
    const duplicate = await run(["join", "--as", "another"], { cwd, dataDir });

    expect(first.code).toBe(0);
    expect(JSON.parse(first.stdout).origin.role).toBe("codex");
    expect(duplicate.code).toBe(1);
    expect(duplicate.stderr).toContain("already has an Origin");
  });

  test("listen launches an agent command and exits successfully", async () => {
    const valid = await run(["listen", "--as", "pi", "--", "bun", "-e", "process.exit(0)"]);

    expect(valid.code).toBe(0);
  });

  test("listen requires a command after --", async () => {
    const missingCommand = await run(["listen", "--as", "pi"]);
    expect(missingCommand.code).toBe(1);
    expect(missingCommand.stderr).toContain("requires");
  });

  test("current and done use the Agent Environment token", async () => {
    const dataDir = makeDir("agentq-cli-data-");
    const cwd = makeDir("agentq-cli-workspace-");
    const store = new AgentQueueStore({ dataDir });
    try {
      store.registerOrigin({ cwd, role: "codex" });
      const waiter = store.registerWaiter({
        cwd,
        role: "pi",
        afterRole: null,
        launchCommand: ["pi"],
      });
      store.createHandoff({ cwd, body: "please review" });

      const current = await run(["current"], {
        cwd,
        dataDir,
        env: { [AGENTQ_TOKEN_ENV]: waiter.token },
      });
      expect(current.code).toBe(0);
      expect(JSON.parse(current.stdout).state).toBe("assigned");

      const done = await run(["done", "--body", "review complete"], {
        cwd,
        dataDir,
        env: { [AGENTQ_TOKEN_ENV]: waiter.token },
      });
      expect(done.code).toBe(0);
      expect(JSON.parse(done.stdout).completedAssignment.role).toBe("pi");
    } finally {
      store.close();
    }
  });

  test("handoff fails when no direct waiters exist", async () => {
    const dataDir = makeDir("agentq-cli-data-");
    const cwd = makeDir("agentq-cli-workspace-");
    await run(["join", "--as", "codex"], { cwd, dataDir });

    const handoff = await run(["handoff", "--body", "please review"], { cwd, dataDir });

    expect(handoff.code).toBe(1);
    expect(handoff.stderr).toContain("no Direct Waiters");
  });

  test("current fails without token", async () => {
    const result = await run(["current"], { env: { [AGENTQ_TOKEN_ENV]: "" } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("required");
  });

  test("done fails without token", async () => {
    const result = await run(["done", "--body", "test"], { env: { [AGENTQ_TOKEN_ENV]: "" } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("required");
  });

  test("unknown command fails", async () => {
    const result = await run(["unknown"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown command");
  });

  test("status returns empty state for new room", async () => {
    const result = await run(["status"]);
    expect(result.code).toBe(0);
    const status = JSON.parse(result.stdout);
    expect(status.origin).toBeNull();
    expect(status.directWaiters).toEqual([]);
    expect(status.activeAssignments).toEqual([]);
  });

  test("dismiss returns the pre-delete room snapshot", async () => {
    const dataDir = makeDir("agentq-cli-data-");
    const cwd = makeDir("agentq-cli-workspace-");
    await run(["join", "--as", "codex"], { cwd, dataDir });

    const dismiss = await run(["dismiss"], { cwd, dataDir });
    expect(dismiss.code).toBe(0);
    const dismissedSnapshot = JSON.parse(dismiss.stdout);
    expect(dismissedSnapshot.origin).toMatchObject({ role: "codex" });

    const status = await run(["status"], { cwd, dataDir });
    expect(JSON.parse(status.stdout).origin).toBeNull();
  });

  test("CLI error output includes error code for AgentQError", async () => {
    const dataDir = makeDir("agentq-cli-data-");
    const cwd = makeDir("agentq-cli-workspace-");
    await run(["join", "--as", "codex"], { cwd, dataDir });

    const duplicate = await run(["join", "--as", "another"], { cwd, dataDir });
    expect(duplicate.code).toBe(1);
    const errJson = JSON.parse(duplicate.stderr);
    expect(errJson.code).toBe("origin-exists");
    expect(errJson.message).toContain("already has an Origin");
  });

  test("handoff with a missing artifact path prints structured JSON error", async () => {
    const dataDir = makeDir("agentq-cli-data-");
    const cwd = makeDir("agentq-cli-workspace-");
    const store = new AgentQueueStore({ dataDir });
    try {
      store.registerOrigin({ cwd, role: "codex" });
      store.registerWaiter({
        cwd,
        role: "pi",
        afterRole: null,
        launchCommand: ["pi"],
      });

      const result = await run(
        ["handoff", "--body", "please review", "--artifact", join(cwd, "missing.md")],
        { cwd, dataDir },
      );

      expect(result.code).toBe(1);
      const errJson = JSON.parse(result.stderr);
      expect(errJson.code).toBe("artifact-not-found");
      expect(errJson.message).toContain("Artifact path was not found");
    } finally {
      store.close();
    }
  });

  test("status and current reject conflicting output tier flags", async () => {
    const status = await run(["status", "--summary", "--full"]);
    expect(status.code).toBe(1);
    expect(status.stderr).toContain("Cannot combine");

    const current = await run(["current", "--summary", "--full"], {
      env: { [AGENTQ_TOKEN_ENV]: "unused" },
    });
    expect(current.code).toBe(1);
    expect(current.stderr).toContain("Cannot combine");
  });

  test("status and current default to summary output", async () => {
    const dataDir = makeDir("agentq-cli-data-");
    const cwd = makeDir("agentq-cli-workspace-");
    const store = new AgentQueueStore({ dataDir });
    try {
      store.registerOrigin({ cwd, role: "codex" });
      const pi = store.registerWaiter({
        cwd,
        role: "pi",
        afterRole: null,
        launchCommand: ["pi"],
      });
      store.createHandoff({ cwd, body: "please review" });
      store.submitDoneReport({ token: pi.token, body: "done" });

      const status = await run(["status"], { cwd, dataDir });
      const fullStatus = await run(["status", "--full"], { cwd, dataDir });

      expect(status.code).toBe(0);
      expect(fullStatus.code).toBe(0);
      expect(JSON.parse(status.stdout).completedBranches).toBeUndefined();
      expect(JSON.parse(fullStatus.stdout).completedBranches).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  test("status summary omits completed branch history", async () => {
    const dataDir = makeDir("agentq-cli-data-");
    const cwd = makeDir("agentq-cli-workspace-");
    const store = new AgentQueueStore({ dataDir });
    try {
      store.registerOrigin({ cwd, role: "codex" });
      const pi = store.registerWaiter({
        cwd,
        role: "pi",
        afterRole: null,
        launchCommand: ["pi"],
      });
      store.createHandoff({ cwd, body: "please review" });
      store.submitDoneReport({ token: pi.token, body: "done" });

      const summary = await run(["status", "--summary"], { cwd, dataDir });
      const full = await run(["status", "--full"], { cwd, dataDir });

      expect(summary.code).toBe(0);
      expect(full.code).toBe(0);
      expect(JSON.parse(summary.stdout).completedBranches).toBeUndefined();
      expect(JSON.parse(full.stdout).completedBranches).toHaveLength(1);
    } finally {
      store.close();
    }
  });
});
