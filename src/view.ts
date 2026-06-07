import type { CurrentResult, StatusResult } from "./store";

export type OutputTier = "summary" | "full";

const BODY_PREVIEW_LENGTH = 160;

export interface StatusSummary {
  room: { id: string; canonicalCwd: string };
  handoffCreated: boolean;
  origin: { role: string } | null;
  directWaiters: Array<{ role: string; count: number }>;
  deferredWaiters: Array<{ role: string; afterRole: string; count: number }>;
  activeAssignments: Array<{
    id: string;
    role: string;
    baton: { id: string; bodyPreview: string; artifactPaths: string[] };
    doneReportCount: number;
    assignedInstanceCount: number;
  }>;
  activeArtifactPaths: string[];
}

export type CurrentSummary =
  | {
      state: "waiting";
      instance: { instanceId: string; role: string; afterRole: string | null };
    }
  | {
      state: "assigned";
      instance: { instanceId: string; role: string };
      assignment: {
        id: string;
        role: string;
        baton: { id: string; bodyPreview: string; artifactPaths: string[] };
        hasDoneReport: boolean;
      };
    };

export const previewBody = (body: string) => {
  if (body.length <= BODY_PREVIEW_LENGTH) {
    return body;
  }
  return `${body.slice(0, BODY_PREVIEW_LENGTH)}…`;
};

export const viewStatus = (
  status: StatusResult,
  tier: OutputTier,
): StatusResult | StatusSummary => {
  if (tier === "full") {
    return status;
  }
  const activeArtifactIds = new Set(
    status.activeAssignments.flatMap((assignment) => [
      ...assignment.baton.artifacts.map((artifact) => artifact.id),
      ...assignment.doneReports.flatMap((report) =>
        report.artifacts.map((artifact) => artifact.id),
      ),
    ]),
  );
  return {
    room: {
      id: status.room.id,
      canonicalCwd: status.room.canonicalCwd,
    },
    handoffCreated: status.handoffCreated,
    origin: status.origin ? { role: status.origin.role } : null,
    directWaiters: status.directWaiters.map((group) => ({
      role: group.role,
      count: group.instances.length,
    })),
    deferredWaiters: status.deferredWaiters.map((group) => ({
      role: group.role,
      afterRole: group.afterRole,
      count: group.instances.length,
    })),
    activeAssignments: status.activeAssignments.map((assignment) => ({
      id: assignment.id,
      role: assignment.role,
      baton: {
        id: assignment.baton.id,
        bodyPreview: previewBody(assignment.baton.body),
        artifactPaths: assignment.baton.artifacts.map((artifact) => artifact.storedPath),
      },
      doneReportCount: assignment.doneReports.length,
      assignedInstanceCount: assignment.agentInstanceIds.length,
    })),
    activeArtifactPaths: status.artifacts
      .filter((artifact) => activeArtifactIds.has(artifact.id))
      .map((artifact) => artifact.storedPath),
  };
};

export const viewCurrent = (
  current: CurrentResult,
  tier: OutputTier,
): CurrentResult | CurrentSummary => {
  if (tier === "full") {
    return current;
  }
  if (current.state === "waiting") {
    return {
      state: "waiting" as const,
      instance: {
        instanceId: current.instance.instanceId,
        role: current.instance.role,
        afterRole: current.instance.afterRole,
      },
    };
  }
  return {
    state: "assigned" as const,
    instance: {
      instanceId: current.instance.instanceId,
      role: current.instance.role,
    },
    assignment: {
      id: current.assignment.id,
      role: current.assignment.role,
      baton: {
        id: current.assignment.baton.id,
        bodyPreview: previewBody(current.assignment.baton.body),
        artifactPaths: current.assignment.baton.artifacts.map((artifact) => artifact.storedPath),
      },
      hasDoneReport: current.assignment.doneReport !== null,
    },
  };
};
