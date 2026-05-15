import { resolve } from "node:path";
import { ensureInsideRoot } from "../pathSafety.js";
import { runCommand } from "../shell.js";

export interface PullRequestResult {
  url: string;
  output: string;
}

export class GitHubPrService {
  constructor(
    private readonly allowedRepoRootsProvider: () => string[],
    private readonly timeoutMsProvider: () => number,
  ) {}

  async createPullRequest(repoPath: string, title?: string): Promise<PullRequestResult> {
    const cwd = await this.resolveAllowedRepo(repoPath);
    const args = ["pr", "create", "--fill"];
    if (title) args.push("--title", title);
    const result = await runCommand("gh", args, { cwd, timeoutMs: this.timeoutMsProvider() });
    const output = `${result.stdout}${result.stderr}`.trim();
    if (result.status !== 0) throw new Error(`gh_pr_create_failed:${result.status}:${output}`);
    const url =
      output.match(/https:\/\/github\.com\/\S+\/pull\/\d+/)?.[0] ?? output.split(/\s+/)[0];
    return { url, output };
  }

  private async resolveAllowedRepo(repoPath: string): Promise<string> {
    const candidate = resolve(repoPath);
    const roots = this.allowedRepoRootsProvider();
    if (roots.length === 0) throw new Error("no_github_repo_roots_allowed");
    for (const root of roots) {
      try {
        return await ensureInsideRoot(candidate, root);
      } catch {
        if (resolve(root) === candidate) return candidate;
      }
    }
    throw new Error("repo_path_not_allowed");
  }
}
