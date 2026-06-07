import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentQueueStore } from "../src/store";
import { viewCurrent, viewStatus } from "../src/view";

let store: AgentQueueStore;
let dataDir: string;
let workspace: string;

const setup = () => {
  dataDir = mkdtempSync(join(tmpdir(), "agentq-view-"));
  workspace = mkdtempSync(join(tmpdir(), "agentq-view-workspace-"));
  store = new AgentQueueStore({ dataDir });
};

const teardown = () => {
  store?.close();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
};

beforeEach(setup);
afterEach(teardown);

describe("view output tiers", () => {
  test("status full preserves the current shape", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const status = store.getStatus({ cwd: workspace });
    expect(viewStatus(status, "full")).toEqual(status);
  });

  test("status summary includes room, origin, waiters, and active assignment previews", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    store.registerWaiter({
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
    store.createHandoff({ cwd: workspace, body: "please review the implementation" });

    const summary = viewStatus(store.getStatus({ cwd: workspace }), "summary");
    if ("completedBranches" in summary) {
      throw new Error("expected summary output");
    }

    expect(summary.room.id).toBeTruthy();
    expect(summary.origin).toEqual({ role: "codex" });
    expect(summary.handoffCreated).toBe(true);
    expect(summary.directWaiters).toEqual([]);
    expect(summary.deferredWaiters).toEqual([{ role: "claude", afterRole: "pi", count: 1 }]);
    expect(summary.activeAssignments).toHaveLength(1);
    expect(summary.activeAssignments[0]?.role).toBe("pi");
    const firstAssignment = summary.activeAssignments[0];
    if (!firstAssignment) {
      throw new Error("missing active assignment");
    }
    expect(firstAssignment.baton.bodyPreview).toContain("please review");
    expect("completedBranches" in summary).toBe(false);
  });

  test("status summary includes artifact paths from partial done reports", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const pi1 = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    store.createHandoff({ cwd: workspace, body: "please review the implementation" });
    const artifactPath = join(workspace, "partial-done.md");
    writeFileSync(artifactPath, "partial done artifact");
    const done = store.submitDoneReport({
      token: pi1.token,
      body: "partial done",
      artifactPath,
    });
    const storedArtifactPath = done.doneReport.artifacts[0]?.storedPath;
    if (!storedArtifactPath) {
      throw new Error("missing done report artifact");
    }

    const summary = viewStatus(store.getStatus({ cwd: workspace }), "summary");
    if ("completedBranches" in summary) {
      throw new Error("expected summary output");
    }

    expect(summary.activeAssignments).toHaveLength(1);
    expect(summary.activeArtifactPaths).toContain(storedArtifactPath);
  });

  test("current summary omits full baton body and done report details", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const pi = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    store.createHandoff({ cwd: workspace, body: "please review the implementation" });

    const full = store.getCurrentByToken(pi.token);
    const summary = viewCurrent(full, "summary");
    if (summary.state !== "assigned" || !("hasDoneReport" in summary.assignment)) {
      throw new Error("expected assigned summary output");
    }
    const baton = summary.assignment.baton;
    expect(baton.bodyPreview).toBeTruthy();
    expect(baton.bodyPreview.length).toBeLessThanOrEqual(161);
    expect("body" in baton).toBe(false);
    expect("doneReport" in summary.assignment).toBe(false);
    expect(viewCurrent(full, "full")).toEqual(full);
  });
});
