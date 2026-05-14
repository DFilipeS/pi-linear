import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { LinearClient } from "@linear/sdk";

const SETTINGS_FILE = join(homedir(), ".pi", "agent", "settings.json");

let client: LinearClient | null = null;
let cachedViewerId: string | null = null;
let cachedViewerName: string | null = null;

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function readStoredKey(): string | null {
  return (readSettings().linearApiKey as string) ?? null;
}

export function storeKey(apiKey: string): void {
  const settings = readSettings();
  settings.linearApiKey = apiKey;
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

export function resolveApiKey(): string | null {
  return process.env.LINEAR_API_KEY ?? readStoredKey();
}

export function getClient(): LinearClient {
  if (!client) {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      throw new Error(
        "No Linear API key configured. Run /linear-auth <api-key> or set LINEAR_API_KEY.\nGet your key from https://linear.app/settings/account/security"
      );
    }
    client = new LinearClient({ apiKey });
  }
  return client;
}

export async function getViewerId(): Promise<string> {
  if (!cachedViewerId) {
    const viewer = await getClient().viewer;
    cachedViewerId = viewer.id;
    cachedViewerName = viewer.name;
  }
  return cachedViewerId;
}

export async function getViewerName(): Promise<string> {
  if (!cachedViewerName) {
    await getViewerId();
  }
  return cachedViewerName!;
}

export async function resolveUser(
  id: string | undefined | null
): Promise<string | undefined> {
  if (!id) return undefined;
  if (id === "me") return getViewerId();
  return id;
}

export function resetClient(): void {
  client = null;
  cachedViewerId = null;
  cachedViewerName = null;
}
