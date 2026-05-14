const PRIORITY: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

export function priorityLabel(p: number | undefined | null): string {
  return PRIORITY[p ?? 0] ?? "No priority";
}

export function formatTeams(
  teams: Array<{
    id: string;
    name: string;
    key: string;
    states: Array<{ id: string; name: string; type: string; color: string }>;
    labels: Array<{ id: string; name: string; color: string }>;
  }>
): string {
  if (teams.length === 0) return "No teams found.";
  return teams
    .map((team) => {
      const states = team.states
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => `  - ${s.name} (id: ${s.id}, type: ${s.type})`)
        .join("\n");
      const labels = team.labels
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((l) => `  - ${l.name} (id: ${l.id})`)
        .join("\n");
      return [
        `## ${team.name} (${team.key}) — id: ${team.id}`,
        `States:`,
        states || "  (none)",
        `Labels:`,
        labels || "  (none)",
      ].join("\n");
    })
    .join("\n\n");
}

export interface IssueSummary {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  stateName: string;
  assigneeName: string | null;
  labels: string[];
  teamKey: string;
  dueDate: string | null;
}

export function formatIssueList(issues: IssueSummary[], totalCount?: number): string {
  if (issues.length === 0) return "No issues found.";
  const header = totalCount !== undefined ? `${totalCount} issues found:\n` : `${issues.length} issues:\n`;
  const lines = issues.map((issue) => {
    const parts = [`- ${issue.identifier}: ${issue.title}`];
    parts.push(`  [${priorityLabel(issue.priority)}] [${issue.stateName}]`);
    if (issue.assigneeName) parts.push(`  Assignee: ${issue.assigneeName}`);
    if (issue.labels.length > 0) parts.push(`  Labels: ${issue.labels.join(", ")}`);
    if (issue.dueDate) parts.push(`  Due: ${issue.dueDate}`);
    return parts.join("\n");
  });
  return header + lines.join("\n");
}

export interface IssueDetail extends IssueSummary {
  description: string | null;
  projectName: string | null;
  milestoneName: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
  comments: Array<{
    body: string;
    userName: string;
    createdAt: string;
  }>;
}

export function formatIssueDetail(issue: IssueDetail): string {
  const lines: string[] = [];
  lines.push(`# ${issue.identifier}: ${issue.title}`);
  lines.push(
    `Status: ${issue.stateName} | Priority: ${priorityLabel(issue.priority)} | Assignee: ${issue.assigneeName ?? "Unassigned"} | Team: ${issue.teamKey}`
  );
  if (issue.projectName) lines.push(`Project: ${issue.projectName}`);
  if (issue.milestoneName) lines.push(`Milestone: ${issue.milestoneName}`);
  if (issue.labels.length > 0) lines.push(`Labels: ${issue.labels.join(", ")}`);
  if (issue.dueDate) lines.push(`Due: ${issue.dueDate}`);
  lines.push(`Created: ${issue.createdAt} | Updated: ${issue.updatedAt}`);
  lines.push(`URL: ${issue.url}`);

  if (issue.description) {
    lines.push("");
    lines.push("## Description");
    lines.push(issue.description);
  }

  if (issue.comments.length > 0) {
    lines.push("");
    lines.push(`## Comments (${issue.comments.length})`);
    for (const c of issue.comments) {
      lines.push(`**${c.userName}** (${c.createdAt}):`);
      lines.push(c.body);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  statusName: string;
  leadName: string | null;
  priority: number;
  progress: number;
  startDate: string | null;
  targetDate: string | null;
  teamKeys: string[];
}

export function formatProjectList(projects: ProjectSummary[]): string {
  if (projects.length === 0) return "No projects found.";
  const lines = projects.map((p) => {
    const parts = [`- ${p.name} (id: ${p.id})`];
    parts.push(`  [${p.statusName}] [${priorityLabel(p.priority)}] Progress: ${Math.round(p.progress * 100)}%`);
    if (p.leadName) parts.push(`  Lead: ${p.leadName}`);
    if (p.teamKeys.length > 0) parts.push(`  Teams: ${p.teamKeys.join(", ")}`);
    if (p.startDate || p.targetDate) {
      parts.push(`  ${p.startDate ?? "…"} → ${p.targetDate ?? "…"}`);
    }
    return parts.join("\n");
  });
  return `${projects.length} projects:\n` + lines.join("\n");
}

export interface ProjectDetail extends ProjectSummary {
  content: string | null;
  url: string;
  milestones: Array<{
    id: string;
    name: string;
    targetDate: string | null;
  }>;
}

export function formatProjectDetail(project: ProjectDetail): string {
  const lines: string[] = [];
  lines.push(`# ${project.name}`);
  lines.push(
    `Status: ${project.statusName} | Priority: ${priorityLabel(project.priority)} | Progress: ${Math.round(project.progress * 100)}%`
  );
  if (project.leadName) lines.push(`Lead: ${project.leadName}`);
  if (project.teamKeys.length > 0) lines.push(`Teams: ${project.teamKeys.join(", ")}`);
  if (project.startDate || project.targetDate) {
    lines.push(`Dates: ${project.startDate ?? "…"} → ${project.targetDate ?? "…"}`);
  }
  if (project.description) {
    lines.push("");
    lines.push(project.description);
  }
  if (project.milestones.length > 0) {
    lines.push("");
    lines.push("## Milestones");
    for (const m of project.milestones) {
      lines.push(`- ${m.name} (id: ${m.id})${m.targetDate ? ` — Target: ${m.targetDate}` : ""}`);
    }
  }
  return lines.join("\n");
}

export interface MilestoneSummary {
  id: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  projectId: string;
  projectName: string | null;
}

export function formatMilestoneList(milestones: MilestoneSummary[]): string {
  if (milestones.length === 0) return "No milestones found.";
  const lines = milestones.map((m) => {
    const parts = [`- ${m.name} (id: ${m.id})`];
    if (m.targetDate) parts.push(`  Target: ${m.targetDate}`);
    if (m.projectName) parts.push(`  Project: ${m.projectName}`);
    return parts.join("\n");
  });
  return `${milestones.length} milestones:\n` + lines.join("\n");
}

export function formatDate(d: Date | string | undefined | null): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  return d.toISOString().split("T")[0];
}
