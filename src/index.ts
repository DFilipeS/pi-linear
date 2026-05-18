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

Use "me" as assigneeId/leadId to reference the authenticated user. Issue identifiers (e.g. "BE-123") work as IDs for issue actions.

IMPORTANT: All action-specific parameters (id, teamId, title, etc.) must be passed as top-level properties alongside "action", NOT nested inside a "params" object. Example: {"action": "get_issue", "id": "BE-123"}`;

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
      // All action-specific parameters are defined as top-level optional fields.
      // This ensures they are always received regardless of how the model/harness
      // structures the tool call. They are extracted in execute() and passed to
      // the action handler as a flat params object.
      id: Type.Optional(Type.String({ description: "Issue/project/milestone/relation ID (e.g. \"BE-123\" or UUID)" })),
      teamId: Type.Optional(Type.String({ description: "Team ID (from get_teams)" })),
      teamIds: Type.Optional(Type.Array(Type.String(), { description: "Array of team IDs (for create_project)" })),
      query: Type.Optional(Type.String({ description: "Text search in title/description" })),
      assigneeId: Type.Optional(Type.Any({ description: "User ID or \"me\" for yourself" })),
      status: Type.Optional(Type.String({ description: "State name (e.g. \"In Progress\", \"Done\")" })),
      projectId: Type.Optional(Type.String({ description: "Project ID" })),
      priority: Type.Optional(Type.Number({ description: "Priority: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low" })),
      first: Type.Optional(Type.Number({ description: "Max results (default 25)" })),
      includeArchived: Type.Optional(Type.Boolean({ description: "Include archived items" })),
      title: Type.Optional(Type.String({ description: "Issue/project/milestone title" })),
      description: Type.Optional(Type.String({ description: "Markdown description" })),
      stateId: Type.Optional(Type.String({ description: "Workflow state ID (from get_teams)" })),
      labelIds: Type.Optional(Type.Array(Type.String(), { description: "Array of label IDs" })),
      projectMilestoneId: Type.Optional(Type.String({ description: "Milestone ID" })),
      dueDate: Type.Optional(Type.String({ description: "Due date (YYYY-MM-DD)" })),
      parentId: Type.Optional(Type.String({ description: "Parent issue ID (for sub-issues)" })),
      blockedByIssueIds: Type.Optional(Type.Array(Type.String(), { description: "Issue IDs that block this issue" })),
      blocksIssueIds: Type.Optional(Type.Array(Type.String(), { description: "Issue IDs that this issue blocks" })),
      issueId: Type.Optional(Type.String({ description: "Issue ID (for comments/relations)" })),
      body: Type.Optional(Type.String({ description: "Comment body (markdown)" })),
      relatedIssueId: Type.Optional(Type.String({ description: "Related issue ID (for relations)" })),
      type: Type.Optional(Type.String({ description: "Relation type: \"blocks\", \"duplicate\", \"related\", or \"similar\"" })),
      name: Type.Optional(Type.String({ description: "Project/milestone name" })),
      content: Type.Optional(Type.String({ description: "Long-form markdown content" })),
      leadId: Type.Optional(Type.Any({ description: "Project lead user ID or \"me\"" })),
      startDate: Type.Optional(Type.String({ description: "Start date (YYYY-MM-DD)" })),
      targetDate: Type.Optional(Type.String({ description: "Target date (YYYY-MM-DD)" })),
      statusId: Type.Optional(Type.String({ description: "Project status ID" })),
      memberIds: Type.Optional(Type.Array(Type.String(), { description: "Array of member user IDs" })),
    }),
    async execute(_toolCallId, rawParams, _signal, _onUpdate, _ctx) {
      try {
        const { action, ...params } = rawParams as Record<string, unknown>;
        // Filter out undefined/null values so action handlers only receive what was provided
        const cleanParams: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null) {
            cleanParams[key] = value;
          }
        }
        const result = await executeAction(action as string, cleanParams);
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
