// The instruction sets handed to the full Claude Code agent (in the GitHub
// Action) when Jeff uses the in-app Coder. Two kinds of job, kept separate on
// purpose:
//   - A REVIEW: Jeff asked the chat to look into / check / explain something.
//     The agent reads the real code and reports back in plain English. It never
//     changes app code. This is what the chat launches on its own.
//   - A CHANGE: Jeff tapped "Build this" because he wants the code actually
//     changed. The agent makes the change on a branch for him to approve.
// Both end as something Jeff reviews; nothing ships without his approval.

// How the agent must work inside the one-shot Action (shared by both).
const HOW_TO_WORK = `HOW TO WORK: do this yourself in this one session. Do NOT spawn background agents, subagents, or parallel tasks, and do NOT wait for task notifications — nothing runs in the background here, so you'd just hang. Finish the job directly.`;

// Jeff may have attached a PDF/text document; its extracted text is included in
// the transcript below so the agent can actually use it, but it can carry a
// client's name, address, or payment details. Everything the agent produces
// here (a report file, a PR title/description, a commit message, code, code
// comments) persists on GitHub indefinitely, so that text must never ride
// along verbatim into any of it — shared by both task kinds on purpose.
const DOC_PRIVACY = `A message below may include a block starting with "--- Contents of <filename> ---" — that is text pulled from a document Jeff attached, and it can contain a client's private details (name, address, payment info, etc). Use it to understand what he's asking, but NEVER quote or copy that document's text verbatim into anything you write or commit — not a report file, not a PR title or description, not a commit message, not code, not a code comment. Always describe what it says in your own general words instead (e.g. "the attached file lists a client's name and mailing address") and never repeat the literal name, address, numbers, or other identifying details from it.`;

// The plain-English format the agent must follow whenever it writes a review.
export const REVIEW_FORMAT = `Write it in plain, everyday English for Jeff — a home inspector, not a software engineer. This matters most.
- NO developer jargon (no words like IDOR, RLS, service-role, endpoint, query, schema, null, async, cache, refactor). If a technical word is truly unavoidable, explain it in parentheses in plain words.
- Explain everything by what it MEANS in the real world — for Jeff, his inspectors, his clients, his money, or his reputation — not by how the code works.
Structure it exactly like this:
1. A 2-3 sentence plain summary of what you found.
2. Findings, most important first. For EACH:
   ### <short plain-English title>
   - **What's happening:** one or two plain sentences.
   - **Why it matters to you:** the real-world consequence.
   - **How urgent:** Fix now / Fix soon / Worth doing eventually — with a few words why.
   - **Where it is:** the screen or feature in human terms (file path in parentheses for the builder).
   - **What I'd do:** one plain sentence.
If Jeff asked a direct question, answer it clearly at the top before the findings. Keep the tone honest but calm — don't overstate things.`;

// Jeff asked the chat to look into something — investigate and report, no code change.
export function buildReviewTask(transcript: string): string {
  return `Jeff asked you (in FLOW's coder chat) to look into something and report back. Do NOT modify any application code or config — this is a read-only investigation. Investigate the real code to answer him, then CREATE A NEW FILE at reports/audit-${Date.now()}.md with your findings and add ONLY that file.

${REVIEW_FORMAT}

${DOC_PRIVACY}

${HOW_TO_WORK} Writing that report file is the last thing you do.

Here is his request / your conversation so far:

${transcript}`;
}

// Jeff tapped "Build this" — he wants the code actually changed.
export function buildChangeTask(transcript: string): string {
  return `Jeff wants you to actually change FLOW's code to do the following. Make the change on this branch, follow the project's CLAUDE.md rules, run the build + tests, and keep it focused on exactly what he asked — don't touch unrelated things. Nothing ships until Jeff approves it.

DON'T RUN OUT OF STEPS WITH NOTHING TO SHOW. You have a limited number of steps in this one run. If the request is large (many files or screens), do NOT attempt all of it at once and risk hitting the limit with nothing committed. Instead: make a focused, coherent FIRST batch that fully builds and passes tests, commit it, and in your final message plainly list what you finished and what still remains for a follow-up run. A working partial change that Jeff can approve is far better than an unfinished attempt that produces nothing. Always leave the branch building and the work committed.

${DOC_PRIVACY}

${HOW_TO_WORK}

Here is his request / your conversation so far:

${transcript}`;
}
