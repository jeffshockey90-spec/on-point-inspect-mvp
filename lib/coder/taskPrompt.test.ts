import { describe, expect, it } from "vitest";
import { buildChangeTask, buildReviewTask } from "./taskPrompt";

const transcriptWithDoc = `Jeff: check this\n\n--- Contents of agreement.pdf ---\nJane Smith, 123 Main St, paid $450`;

describe("buildReviewTask", () => {
  it("tells the agent never to quote an attached document's text verbatim", () => {
    const task = buildReviewTask(transcriptWithDoc);
    expect(task).toMatch(/never quote or copy that document's text verbatim/i);
    expect(task).toMatch(/own general words/i);
  });

  it("still includes the full transcript so the agent can actually investigate", () => {
    const task = buildReviewTask(transcriptWithDoc);
    expect(task).toContain(transcriptWithDoc);
  });
});

describe("buildChangeTask", () => {
  it("tells the agent never to quote an attached document's text verbatim", () => {
    const task = buildChangeTask(transcriptWithDoc);
    expect(task).toMatch(/never quote or copy that document's text verbatim/i);
  });

  it("still includes the full transcript so the agent can actually make the change", () => {
    const task = buildChangeTask(transcriptWithDoc);
    expect(task).toContain(transcriptWithDoc);
  });
});
