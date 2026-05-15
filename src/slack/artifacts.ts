import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ensureInsideRoot } from "../pathSafety.js";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const maxDepth = 6;
const maxMatches = 10;

export interface ArtifactMatch {
  path: string;
  name: string;
  size: number;
}

export async function findArtifacts(roots: string[], query: string): Promise<ArtifactMatch[]> {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return [];
  const matches: ArtifactMatch[] = [];
  for (const root of roots) {
    await walk(resolve(root), resolve(root), tokens, matches, 0).catch(() => undefined);
    if (matches.length >= maxMatches) break;
  }
  return matches.slice(0, maxMatches);
}

async function walk(
  root: string,
  current: string,
  tokens: string[],
  matches: ArtifactMatch[],
  depth: number,
): Promise<void> {
  if (matches.length >= maxMatches || depth > maxDepth) return;
  if (current !== root) await ensureInsideRoot(current, root);
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (matches.length >= maxMatches) return;
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(root, path, tokens, matches, depth + 1);
      continue;
    }
    if (!entry.isFile() || !looksLikeImage(entry.name)) continue;
    const normalized = entry.name.toLowerCase();
    if (!tokens.every((token) => normalized.includes(token))) continue;
    const info = await stat(path);
    matches.push({ path, name: entry.name, size: info.size });
  }
}

function looksLikeImage(filename: string): boolean {
  const lower = filename.toLowerCase();
  return [...imageExtensions].some((extension) => lower.endsWith(extension));
}
