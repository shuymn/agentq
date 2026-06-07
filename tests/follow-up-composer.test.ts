import { describe, expect, test } from "bun:test";
import { defaultFollowUpComposer } from "../src/follow-up-composer";

describe("defaultFollowUpComposer", () => {
  test("composes follow-up body and combined artifact payload from done reports", () => {
    const draft = defaultFollowUpComposer.compose({
      completedAssignment: {
        id: "assignment-1",
        role: "pi",
        batonId: "baton-1",
        agentInstanceIds: ["pi-1", "pi-2"],
      },
      doneReports: [
        {
          id: "report-1",
          agentInstanceId: "pi-1",
          body: "review result one",
          artifacts: [],
        },
        {
          id: "report-2",
          agentInstanceId: "pi-2",
          body: "review result two",
          artifacts: [
            {
              id: "artifact-1",
              kind: "user",
              storedPath: "/tmp/review-two.json",
              sourcePath: "/tmp/source.md",
            },
          ],
        },
      ],
    });

    expect(draft.body).toBe("Follow-up Baton after pi completed Baton Assignment assignment-1.");
    expect(draft.combinedArtifactPayload).toEqual({
      assignmentId: "assignment-1",
      role: "pi",
      sourceBatonId: "baton-1",
      doneReports: [
        {
          id: "report-1",
          agentInstanceId: "pi-1",
          body: "review result one",
          artifacts: [],
        },
        {
          id: "report-2",
          agentInstanceId: "pi-2",
          body: "review result two",
          artifacts: [
            {
              id: "artifact-1",
              kind: "user",
              storedPath: "/tmp/review-two.json",
              sourcePath: "/tmp/source.md",
            },
          ],
        },
      ],
    });
  });
});
