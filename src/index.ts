/**
 * Pi Linear Extension
 *
 * Provides a single `linear` tool for managing Linear projects, milestones,
 * issues, and comments via the Linear TypeScript SDK.
 *
 * Auth: Set LINEAR_API_KEY env var, or run /linear-auth to persist a key.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { LinearClient } from "@linear/sdk";
import { resetClient, getClient, storeKey } from "./client.js";
import { executeAction } from "./actions.js";

const ACTIONS = [
  "get_teams",
  "search_issues",
  "get_issue",
  "create_issue",
  "update_issue",
  "create_comment",
  "list_projects",
  "get_project",
  "create_project",
  "update_project",
  "list_milestones",
  "create_milestone",
  "update_milestone",
  "create_issue_relation",
  "delete_issue_relation",
] as const;

const TOOL_DESCRIPTION = `Manage Linear (linear.app) — projects, milestones, issues, and comments.

Actions and their parameters:

**get_teams** — List all teams with workflow states and labels. Always call this first to obtain teamId, stateId, and labelIds needed by other actions. No params.

**search_issues** — Search issues. Params: query (text search in title/description), teamId, assigneeId ("me" = yourself), status (state name like "In Progress", "Done"), projectId, priority (0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low), first (max results, default 25), includeArchived (boolean).

**get_issue** — Full issue details with description, comments, and relations (blockers/blocked by). Params: id (issue identifier like "BE-123" or UUID).

**create_issue** — Create an issue. Params: teamId (required), title (required), description (markdown), priority (0-4), assigneeId ("me"), stateId, labelIds (array of IDs), projectId, projectMilestoneId, dueDate (YYYY-MM-DD), parentId (sub-issue), blockedByIssueIds (array of issue IDs that block this issue), blocksIssueIds (array of issue IDs that this issue blocks).

**update_issue** — Update issue (change status, assignee, priority, etc.). Params: id (required), title, description, priority (0-4), assigneeId ("me" or null to unassign), stateId, labelIds (array, replaces all), projectId, projectMilestoneId, dueDate, blockedByIssueIds (array — adds blocking relations), blocksIssueIds (array — adds blocking relations).

**create_comment** — Add comment to issue. Params: issueId (required), body (required, markdown).

**create_issue_relation** — Create a relation between two issues. Params: issueId (required), relatedIssueId (required), type (required — "blocks", "duplicate", "related", or "similar"). For blockers: the issue with issueId blocks the issue with relatedIssueId.

**delete_issue_relation** — Delete an issue relation. Params: id (required, relation ID from get_issue).

**list_projects** — List projects. Params: teamId, first (default 25), includeArchived (boolean).

**get_project** — Project details with milestones. Params: id (required).

**create_project** — Create project. Params: name (required), teamIds (required, array of team IDs), description (short summary, max 255 chars), content (long-form markdown description), leadId ("me"), startDate (YYYY-MM-DD), targetDate (YYYY-MM-DD), statusId, priority (0-4).

**update_project** — Update project. Params: id (required), name, description (short summary), content (long-form markdown), leadId, startDate, targetDate, statusId, priority, memberIds (array).

**list_milestones** — List milestones. Params: projectId (required).

**create_milestone** — Create milestone. Params: projectId (required), name (required), targetDate (YYYY-MM-DD), description.

**update_milestone** — Update milestone. Params: id (required), name, targetDate, description.

Use "me" as assigneeId/leadId to reference the authenticated user. Issue identifiers (e.g. "BE-123") work as IDs for issue actions.`;

export default function linearExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "linear",
    label: "Linear",
    description: TOOL_DESCRIPTION,
    promptSnippet: "Manage Linear projects, milestones, issues, and comments",
    promptGuidelines: [
      "Use the linear tool when the user asks about Linear issues, projects, milestones, or teams.",
      "Always call get_teams first to obtain teamId, stateId, and labelIds before creating or updating issues.",
      'Use "me" as assigneeId to assign issues or projects to the authenticated user.',
    ],
    parameters: Type.Object({
      action: StringEnum(ACTIONS, { description: "The action to perform" }),
      params: Type.Optional(
        Type.Record(Type.String(), Type.Any(), {
          description:
            "Action-specific parameters. See tool description for each action's required and optional params.",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const result = await executeAction(params.action, params.params ?? {});
        return {
          content: [{ type: "text", text: result.content }],
          details: result.details,
        };
      } catch (err: any) {
        const message =
          err?.message ?? err?.toString() ?? "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error: ${message}`,
            },
          ],
          details: {},
          isError: true,
        };
      }
    },
  });

  // Reset cached client on session changes
  pi.on("session_start", () => {
    resetClient();
  });

  // Command to set the API key
  pi.registerCommand("linear-auth", {
    description:
      "Set Linear API key. Get one from https://linear.app/settings/account/security",
    handler: async (args, ctx) => {
      const key = args?.trim();
      if (!key) {
        ctx.ui.notify(
          "Usage: /linear-auth <api-key>\nGet your key from https://linear.app/settings/account/security",
          "warning"
        );
        return;
      }
      // Verify the key works before storing
      try {
        const tempClient = new LinearClient({ apiKey: key });
        const viewer = await tempClient.viewer;
        storeKey(key);
        resetClient();
        ctx.ui.notify(
          `Connected to Linear as ${viewer.name} (${viewer.email})`,
          "success"
        );
      } catch (err: any) {
        ctx.ui.notify(
          `Invalid API key: ${err?.message ?? "authentication failed"}`,
          "error"
        );
      }
    },
  });
}
