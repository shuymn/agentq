import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../src/cli";
import { AGENTQ_TOKEN_ENV } from "../src/constants";
import { AgentQueueStore } from "../src/store";

let dataDir: string;
let workspace: string;

const setup = () => {
  dataDir = mkdtempSync(join(tmpdir(), "agentq-contract-"));
  workspace = mkdtempSync(join(tmpdir(), "agentq-contract-workspace-"));
};

const teardown = () => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
};

beforeEach(setup);
afterEach(teardown);

const stripVolatile = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripVolatile);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.endsWith("At") && key !== "token")
      .map(([key, nested]) => [key, stripVolatile(nested)]);
    return Object.fromEntries(entries);
  }
  return value;
};

const run = async (args: string[], env: Record<string, string> = {}) => {
  const stdoutLines: string[] = [];
  const code = await runCli({
    argv: args,
    cwd: workspace,
    env: { ...process.env, AGENTQ_DATA_DIR: dataDir, ...env },
    stdout: { log: (msg: string) => stdoutLines.push(msg) },
    stderr: { error: () => {} },
  });
  return { code, value: JSON.parse(stdoutLines.join("\n")) };
};

describe("adapter contract fixtures", () => {
  test("current waiting summary shape is stable", async () => {
    const store = new AgentQueueStore({ dataDir });
    try {
      store.registerOrigin({ cwd: workspace, role: "codex" });
      const waiter = store.registerWaiter({
        cwd: workspace,
        role: "pi",
        afterRole: null,
        launchCommand: ["pi"],
      });
      const result = await run(["current", "--summary"], {
        [AGENTQ_TOKEN_ENV]: waiter.token,
      });
      expect(result.code).toBe(0);
      expect(stripVolatile(result.value)).toEqual({
        state: "waiting",
        instance: {
          instanceId: waiter.instanceId,
          role: "pi",
          afterRole: null,
        },
      });
    } finally {
      store.close();
    }
  });

  test("current assigned full shape is stable", async () => {
    const store = new AgentQueueStore({ dataDir });
    try {
      store.registerOrigin({ cwd: workspace, role: "codex" });
      const waiter = store.registerWaiter({
        cwd: workspace,
        role: "pi",
        afterRole: null,
        launchCommand: ["pi"],
      });
      store.createHandoff({ cwd: workspace, body: "please review" });
      const result = await run(["current", "--full"], {
        [AGENTQ_TOKEN_ENV]: waiter.token,
      });
      expect(result.code).toBe(0);
      expect(stripVolatile(result.value)).toMatchObject({
        state: "assigned",
        instance: {
          instanceId: waiter.instanceId,
          role: "pi",
          afterRole: null,
          status: "assigned",
        },
        assignment: {
          role: "pi",
          status: "active",
          baton: {
            body: "please review",
            artifacts: [],
          },
          doneReport: null,
        },
      });
    } finally {
      store.close();
    }
  });

  test("status full and done result expose expected top-level fields", async () => {
    const store = new AgentQueueStore({ dataDir });
    try {
      store.registerOrigin({ cwd: workspace, role: "codex" });
      const waiter = store.registerWaiter({
        cwd: workspace,
        role: "pi",
        afterRole: null,
        launchCommand: ["pi"],
      });
      store.registerWaiter({
        cwd: workspace,
        role: "claude",
        afterRole: "pi",
        launchCommand: ["claude"],
      });
      store.createHandoff({ cwd: workspace, body: "please review" });

      const status = await run(["status", "--full"]);
      expect(status.code).toBe(0);
      expect(stripVolatile(status.value)).toMatchObject({
        handoffCreated: true,
        origin: { role: "codex" },
        directWaiters: [],
        deferredWaiters: [{ role: "claude", afterRole: "pi" }],
        activeAssignments: [
          {
            role: "pi",
            status: "active",
            baton: { body: "please review" },
            doneReports: [],
          },
        ],
        completedBranches: [],
      });

      const done = await run(["done", "--body", "review complete"], {
        [AGENTQ_TOKEN_ENV]: waiter.token,
      });
      expect(done.code).toBe(0);
      expect(stripVolatile(done.value)).toMatchObject({
        doneReport: { body: "review complete" },
        completedAssignment: { role: "pi", status: "completed" },
        followUpBaton: { body: expect.stringContaining("Follow-up Baton after pi") },
        followUpAssignments: [{ role: "claude", status: "active" }],
      });
    } finally {
      store.close();
    }
  });
});
