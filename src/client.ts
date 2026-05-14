import { LinearClient } from "@linear/sdk";

let client: LinearClient | null = null;
let cachedViewerId: string | null = null;
let cachedViewerName: string | null = null;

export function getClient(): LinearClient {
  if (!client) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error(
        "LINEAR_API_KEY is not set. Get your API key from https://linear.app/settings/account/security"
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
