export interface FollowUpAssignmentContext {
  id: string;
  role: string;
  batonId: string;
  agentInstanceIds: string[];
}

export interface FollowUpDoneReportContext {
  id: string;
  agentInstanceId: string;
  body: string;
  artifacts: Array<{
    id: string;
    kind: string;
    storedPath: string;
    sourcePath: string | null;
  }>;
}

export interface CombinedArtifactPayload {
  assignmentId: string;
  role: string;
  sourceBatonId: string;
  doneReports: Array<{
    id: string;
    agentInstanceId: string;
    body: string;
    artifacts: Array<{
      id: string;
      kind: string;
      storedPath: string;
      sourcePath: string | null;
    }>;
  }>;
}

export interface FollowUpComposerInput {
  completedAssignment: FollowUpAssignmentContext;
  doneReports: FollowUpDoneReportContext[];
}

export interface FollowUpComposerDraft {
  body: string;
  combinedArtifactPayload: CombinedArtifactPayload;
}

/**
 * Transform seam: compose a Follow-up Baton draft from a completed assignment.
 * Workspace-specific composers are future work; the default implementation
 * preserves current Agent Queue behavior.
 */
export interface FollowUpComposer {
  compose(input: FollowUpComposerInput): FollowUpComposerDraft;
}

export const defaultFollowUpComposer: FollowUpComposer = {
  compose({ completedAssignment, doneReports }) {
    return {
      body: `Follow-up Baton after ${completedAssignment.role} completed Baton Assignment ${completedAssignment.id}.`,
      combinedArtifactPayload: {
        assignmentId: completedAssignment.id,
        role: completedAssignment.role,
        sourceBatonId: completedAssignment.batonId,
        doneReports: doneReports.map((report) => ({
          id: report.id,
          agentInstanceId: report.agentInstanceId,
          body: report.body,
          artifacts: report.artifacts.map((artifact) => ({
            id: artifact.id,
            kind: artifact.kind,
            storedPath: artifact.storedPath,
            sourcePath: artifact.sourcePath,
          })),
        })),
      },
    };
  },
};
