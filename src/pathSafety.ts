import { mkdir, realpath } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

export async function canonicalize(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    await mkdir(parent, { recursive: true });
    return join(await realpath(parent), basename(path));
  }
}

export async function ensureInsideRoot(
  workspacePath: string,
  workspaceRoot: string,
): Promise<string> {
  const canonicalRoot = await canonicalize(workspaceRoot);
  const canonicalWorkspace = await canonicalize(workspacePath);
  if (samePath(canonicalWorkspace, canonicalRoot)) {
    throw new Error(`workspace_equals_root:${canonicalWorkspace}`);
  }
  const rel = relative(canonicalRoot, canonicalWorkspace);
  if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`) || isAbsoluteLike(rel)) {
    throw new Error(`workspace_outside_root:${canonicalWorkspace}:${canonicalRoot}`);
  }
  return canonicalWorkspace;
}

export function sanitizeWorkspaceKey(identifier: string | null | undefined): string {
  return (identifier || "issue").replace(/[^A-Za-z0-9._-]/g, "_");
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function isAbsoluteLike(path: string): boolean {
  return /^[A-Za-z]:/.test(path) || path.startsWith("/") || path.startsWith("\\");
}
