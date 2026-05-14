import { getClient, resolveUser } from "./client.js";
import {
  formatTeams,
  formatIssueList,
  formatIssueDetail,
  formatProjectList,
  formatProjectDetail,
  formatMilestoneList,
  formatDate,
  priorityLabel,
  type IssueSummary,
  type IssueDetail,
  type ProjectSummary,
  type ProjectDetail,
  type MilestoneSummary,
} from "./format.js";

export interface ActionResult {
  content: string;
  details: Record<string, unknown>;
}

export async function executeAction(
  action: string,
  params: Record<string, unknown> = {}
): Promise<ActionResult> {
  switch (action) {
    case "get_teams":
      return getTeams();
    case "search_issues":
      return searchIssues(params);
    case "get_issue":
      return getIssue(params);
    case "create_issue":
      return createIssue(params);
    case "update_issue":
      return updateIssue(params);
    case "create_comment":
      return createComment(params);
    case "list_projects":
      return listProjects(params);
    case "get_project":
      return getProject(params);
    case "create_project":
      return createProject(params);
    case "update_project":
      return updateProject(params);
    case "list_milestones":
      return listMilestones(params);
    case "create_milestone":
      return createMilestone(params);
    case "update_milestone":
      return updateMilestone(params);
    default:
      throw new Error(`Unknown linear action: ${action}`);
  }
}

// ── Teams ──────────────────────────────────────────────────────────────

async function getTeams(): Promise<ActionResult> {
  const client = getClient();
  const conn = await client.teams();
  const teams = await Promise.all(
    conn.nodes.map(async (team) => {
      const [statesConn, labelsConn] = await Promise.all([
        team.states(),
        team.labels(),
      ]);
      return {
        id: team.id,
        name: team.name,
        key: team.key,
        states: statesConn.nodes.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          color: s.color,
        })),
        labels: labelsConn.nodes.map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
        })),
      };
    })
  );

  return {
    content: formatTeams(teams),
    details: { teams },
  };
}

// ── Issues ─────────────────────────────────────────────────────────────

async function searchIssues(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const andFilters: Record<string, unknown>[] = [];

  if (params.query) {
    andFilters.push({
      or: [
        { title: { contains: String(params.query) } },
        { description: { contains: String(params.query) } },
      ],
    });
  }
  if (params.teamId) {
    andFilters.push({ team: { id: { eq: String(params.teamId) } } });
  }
  if (params.assigneeId) {
    const assigneeId = await resolveUser(String(params.assigneeId));
    andFilters.push({ assignee: { id: { eq: assigneeId } } });
  }
  if (params.status) {
    andFilters.push({ state: { name: { eq: String(params.status) } } });
  }
  if (params.projectId) {
    andFilters.push({ project: { id: { eq: String(params.projectId) } } });
  }
  if (params.priority !== undefined && params.priority !== null) {
    andFilters.push({ priority: { eq: Number(params.priority) } });
  }

  const filter = andFilters.length > 0 ? { and: andFilters } : undefined;

  const conn = await client.issues({
    filter,
    first: Number(params.first) || 25,
    includeArchived: params.includeArchived === true,
    orderBy: "updatedAt",
  });

  const issues = await Promise.all(
    conn.nodes.map(async (issue): Promise<IssueSummary> => {
      const [assignee, state, labelsConn, team] = await Promise.all([
        issue.assignee,
        issue.state,
        issue.labels(),
        issue.team,
      ]);
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        priority: issue.priority,
        stateName: state?.name ?? "Unknown",
        assigneeName: assignee?.name ?? null,
        labels: labelsConn.nodes.map((l) => l.name),
        teamKey: team?.key ?? "",
        dueDate: issue.dueDate ?? null,
      };
    })
  );

  return {
    content: formatIssueList(issues),
    details: { issues },
  };
}

async function getIssue(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const id = required(params.id, "id");
  const issue = await client.issue(id);

  const [assignee, state, labelsConn, commentsConn, team, project, milestone] =
    await Promise.all([
      issue.assignee,
      issue.state,
      issue.labels(),
      issue.comments(),
      issue.team,
      issue.project,
      issue.projectMilestone,
    ]);

  const comments = await Promise.all(
    commentsConn.nodes.map(async (c) => {
      const user = await c.user;
      return {
        body: c.body ?? "",
        userName: user?.name ?? "Unknown",
        createdAt: formatDate(c.createdAt),
      };
    })
  );

  const detail: IssueDetail = {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    priority: issue.priority,
    stateName: state?.name ?? "Unknown",
    assigneeName: assignee?.name ?? null,
    labels: labelsConn.nodes.map((l) => l.name),
    teamKey: team?.key ?? "",
    dueDate: issue.dueDate ?? null,
    description: issue.description ?? null,
    projectName: project?.name ?? null,
    milestoneName: milestone?.name ?? null,
    createdAt: formatDate(issue.createdAt),
    updatedAt: formatDate(issue.updatedAt),
    url: issue.url,
    comments,
  };

  return {
    content: formatIssueDetail(detail),
    details: { issue: detail },
  };
}

async function createIssue(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const teamId = required(params.teamId, "teamId");
  const title = required(params.title, "title");

  const assigneeId = await resolveUser(
    params.assigneeId ? String(params.assigneeId) : undefined
  );

  const input: Record<string, unknown> = {
    teamId,
    title,
  };
  if (params.description) input.description = String(params.description);
  if (params.priority !== undefined && params.priority !== null)
    input.priority = Number(params.priority);
  if (assigneeId) input.assigneeId = assigneeId;
  if (params.stateId) input.stateId = String(params.stateId);
  if (params.labelIds) input.labelIds = params.labelIds;
  if (params.projectId) input.projectId = String(params.projectId);
  if (params.projectMilestoneId)
    input.projectMilestoneId = String(params.projectMilestoneId);
  if (params.dueDate) input.dueDate = String(params.dueDate);
  if (params.parentId) input.parentId = String(params.parentId);

  const payload = await client.createIssue(input);
  const issueRef = (await payload.issue)!;
  // Re-fetch for full data (mutation only returns id)
  const issue = await client.issue(issueRef.id);

  const [state, assignee] = await Promise.all([issue.state, issue.assignee]);

  const result = {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    priority: issue.priority,
    stateName: state?.name ?? "Unknown",
    assigneeName: assignee?.name ?? null,
    url: issue.url,
  };

  return {
    content: `Created issue ${result.identifier}: ${result.title}\nStatus: ${result.stateName} | Priority: ${priorityLabel(result.priority)} | Assignee: ${result.assigneeName ?? "Unassigned"}\nURL: ${result.url}`,
    details: { issue: result },
  };
}

async function updateIssue(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const id = required(params.id, "id");

  const assigneeId = await resolveUser(
    params.assigneeId ? String(params.assigneeId) : (params.assigneeId as string | null | undefined)
  );

  const input: Record<string, unknown> = {};
  maybeSet(input, params, "title");
  maybeSet(input, params, "description");
  maybeSet(input, params, "priority", Number);
  maybeSet(input, params, "stateId");
  maybeSet(input, params, "projectId");
  maybeSet(input, params, "projectMilestoneId");
  maybeSet(input, params, "dueDate");
  if (params.labelIds !== undefined) input.labelIds = params.labelIds;
  if (assigneeId !== undefined) input.assigneeId = assigneeId;
  // Explicitly support unassigning
  if (params.assigneeId === null) input.assigneeId = null;

  if (Object.keys(input).length === 0) {
    return {
      content: "No fields provided to update.",
      details: {},
    };
  }

  const payload = await client.updateIssue(id, input);
  // Re-fetch for full data (mutation only returns id)
  const issue = await client.issue(id);

  const [state, assignee] = await Promise.all([issue.state, issue.assignee]);

  const result = {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    priority: issue.priority,
    stateName: state?.name ?? "Unknown",
    assigneeName: assignee?.name ?? null,
    url: issue.url,
  };

  const changes = Object.keys(input)
    .map((k) => `${k}: ${JSON.stringify(input[k])}`)
    .join(", ");

  return {
    content: `Updated ${result.identifier}: ${result.title}\nChanges: ${changes}\nStatus: ${result.stateName} | Priority: ${priorityLabel(result.priority)} | Assignee: ${result.assigneeName ?? "Unassigned"}\nURL: ${result.url}`,
    details: { issue: result, changes: input },
  };
}

// ── Comments ───────────────────────────────────────────────────────────

async function createComment(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const issueId = required(params.issueId, "issueId");
  const body = required(params.body, "body");

  const payload = await client.createComment({ issueId, body: String(body) });

  if (!payload.success) {
    return { content: "Failed to create comment.", details: {} };
  }

  return {
    content: `Comment added to ${issueId}.`,
    details: { success: true, issueId },
  };
}

// ── Projects ───────────────────────────────────────────────────────────

async function listProjects(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const filter: Record<string, unknown>[] = [];

  if (params.teamId) {
    filter.push({ accessibleTeams: { some: { id: { eq: String(params.teamId) } } } });
  }

  const conn = await client.projects({
    filter: filter.length > 0 ? { and: filter } : undefined,
    first: Number(params.first) || 25,
    includeArchived: params.includeArchived === true,
    orderBy: "updatedAt",
  });

  const projects = await Promise.all(
    conn.nodes.map(async (project): Promise<ProjectSummary> => {
      const [lead, status, teamsConn] = await Promise.all([
        project.lead,
        project.status,
        project.teams(),
      ]);
      return {
        id: project.id,
        name: project.name,
        description: project.description ?? "",
        statusName: status?.name ?? "Unknown",
        leadName: lead?.name ?? null,
        priority: project.priority,
        progress: project.progress,
        startDate: formatDate(project.startDate),
        targetDate: formatDate(project.targetDate),
        teamKeys: teamsConn.nodes.map((t) => t.key),
      };
    })
  );

  return {
    content: formatProjectList(projects),
    details: { projects },
  };
}

async function getProject(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const id = required(params.id, "id");
  const project = await client.project(id);

  const [lead, status, teamsConn, milestonesConn] =
    await Promise.all([
      project.lead,
      project.status,
      project.teams(),
      project.projectMilestones ? project.projectMilestones() : Promise.resolve({ nodes: [] }),
    ]);

  const detail: ProjectDetail = {
    id: project.id,
    name: project.name,
    description: project.description ?? "",
    statusName: status?.name ?? "Unknown",
    leadName: lead?.name ?? null,
    priority: project.priority,
    progress: project.progress,
    startDate: formatDate(project.startDate),
    targetDate: formatDate(project.targetDate),
    teamKeys: teamsConn?.nodes?.map((t) => t.key) ?? [],
    content: project.content ?? null,
    url: (project as any).url ?? "",
    milestones: (milestonesConn as any)?.nodes?.map((m: any) => ({
      id: m.id,
      name: m.name,
      targetDate: m.targetDate ?? null,
    })) ?? [],
  };

  return {
    content: formatProjectDetail(detail),
    details: { project: detail },
  };
}

async function createProject(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const name = required(params.name, "name");
  const teamIds = required(params.teamIds, "teamIds") as string[];

  const leadId = await resolveUser(
    params.leadId ? String(params.leadId) : undefined
  );

  const input: Record<string, unknown> = {
    name,
    teamIds: Array.isArray(teamIds) ? teamIds : [teamIds],
  };
  if (params.description) input.description = String(params.description);
  if (leadId) input.leadId = leadId;
  if (params.startDate) input.startDate = String(params.startDate);
  if (params.targetDate) input.targetDate = String(params.targetDate);
  if (params.statusId) input.statusId = String(params.statusId);
  maybeSet(input, params, "priority", Number);
  if (params.color) input.color = String(params.color);
  if (params.icon) input.icon = String(params.icon);

  const payload = await client.createProject(input);
  const projectRef = (await payload.project)!;
  // Re-fetch for full data
  const project = await client.project(projectRef.id);

  return {
    content: `Created project: ${project.name} (id: ${project.id})`,
    details: { project: { id: project.id, name: project.name } },
  };
}

async function updateProject(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const id = required(params.id, "id");

  const leadId = await resolveUser(
    params.leadId ? String(params.leadId) : (params.leadId as string | null | undefined)
  );

  const input: Record<string, unknown> = {};
  maybeSet(input, params, "name");
  maybeSet(input, params, "description");
  maybeSet(input, params, "startDate");
  maybeSet(input, params, "targetDate");
  maybeSet(input, params, "statusId");
  maybeSet(input, params, "priority", Number);
  maybeSet(input, params, "color");
  maybeSet(input, params, "icon");
  if (leadId !== undefined) input.leadId = leadId;
  if (params.leadId === null) input.leadId = null;
  if (params.memberIds !== undefined) input.memberIds = params.memberIds;

  if (Object.keys(input).length === 0) {
    return { content: "No fields provided to update.", details: {} };
  }

  const payload = await client.updateProject(id, input);
  // Re-fetch for full data
  const project = await client.project(id);

  const changes = Object.keys(input)
    .map((k) => `${k}: ${JSON.stringify(input[k])}`)
    .join(", ");

  return {
    content: `Updated project: ${project.name} (id: ${project.id})\nChanges: ${changes}`,
    details: { project: { id: project.id, name: project.name }, changes: input },
  };
}

// ── Milestones ─────────────────────────────────────────────────────────

async function listMilestones(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const projectId = required(params.projectId, "projectId");

  // Fetch the project and its milestones
  const project = await client.project(projectId);
  const conn = await project.projectMilestones({
    first: Number(params.first) || 50,
  });

  const milestones: MilestoneSummary[] = conn.nodes.map((m: any) => ({
    id: m.id,
    name: m.name,
    description: m.description ?? null,
    targetDate: m.targetDate ?? null,
    projectId,
    projectName: project.name,
  }));

  return {
    content: formatMilestoneList(milestones),
    details: { milestones },
  };
}

async function createMilestone(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const projectId = required(params.projectId, "projectId");
  const name = required(params.name, "name");

  const input: Record<string, unknown> = { projectId, name };
  if (params.description) input.description = String(params.description);
  if (params.targetDate) input.targetDate = String(params.targetDate);

  const payload = await client.createProjectMilestone(input);
  const msRef = (await payload.projectMilestone)!;
  // Re-fetch for full data
  const milestone = await client.projectMilestone(msRef.id);

  return {
    content: `Created milestone: ${milestone.name} (id: ${milestone.id})${milestone.targetDate ? ` — Target: ${milestone.targetDate}` : ""}`,
    details: { milestone: { id: milestone.id, name: milestone.name } },
  };
}

async function updateMilestone(params: Record<string, unknown>): Promise<ActionResult> {
  const client = getClient();
  const id = required(params.id, "id");

  const input: Record<string, unknown> = {};
  maybeSet(input, params, "name");
  maybeSet(input, params, "description");
  maybeSet(input, params, "targetDate");

  if (Object.keys(input).length === 0) {
    return { content: "No fields provided to update.", details: {} };
  }

  const payload = await client.updateProjectMilestone(id, input);
  // Re-fetch for full data
  const milestone = await client.projectMilestone(id);

  return {
    content: `Updated milestone: ${milestone.name} (id: ${milestone.id})`,
    details: { milestone: { id: milestone.id, name: milestone.name }, changes: input },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function required(value: unknown, name: string): string {
  if (value === undefined || value === null) {
    throw new Error(`Missing required parameter: ${name}`);
  }
  return String(value);
}

function maybeSet(
  input: Record<string, unknown>,
  params: Record<string, unknown>,
  key: string,
  transform?: (v: unknown) => unknown
): void {
  if (params[key] !== undefined && params[key] !== null) {
    input[key] = transform ? transform(params[key]) : String(params[key]);
  }
}
