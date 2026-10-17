// In-app coding agent: thin GitHub API helpers so the whole experience
// (trigger → review → merge) lives inside FLOW. GitHub is invisible plumbing.
// Needs GITHUB_CODER_TOKEN (fine-grained PAT, this repo: Contents RW, Pull
// requests RW, Actions R, Metadata R) + GITHUB_CODER_REPO ("owner/repo").
import { getSessionUser } from "../apiAuth";
import { OWNER_EMAILS } from "../ownerEmails";

export function coderRepo(): string {
  return process.env.GITHUB_CODER_REPO || "jeffshockey90-spec/on-point-inspect-mvp";
}

export function coderConfigured(): boolean {
  return Boolean(process.env.GITHUB_CODER_TOKEN);
}

// Only the owner may touch the coding agent — it can change + deploy the whole app.
export async function requireOwnerUser(): Promise<{ id: string; email: string } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const email = String(user.email || "").toLowerCase();
  return OWNER_EMAILS.includes(email) ? { id: user.id, email } : null;
}

export async function gh(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.GITHUB_CODER_TOKEN;
  if (!token) throw new Error("GitHub coder token is not set.");
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}
