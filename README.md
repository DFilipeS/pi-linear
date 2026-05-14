# Pi Linear Extension

A [Pi](https://pi.dev) extension for managing Linear projects, milestones, issues, and comments via the Linear TypeScript SDK.

## Setup

### 1. Get a Linear API Key

Go to **Linear → Settings → Account → Security → Personal API keys** and create a new key.

### 2. Set the API key

Option A — Environment variable (recommended):

```bash
export LINEAR_API_KEY="lin_api_xxx"
```

Option B — Pi command:

```
/linear-auth lin_api_xxx
```

### 3. Install the extension

Add to `~/.pi/agent/settings.json`:

```json
{
  "extensions": ["/Users/daniel/Developer/pi-linear/src/index.ts"]
}
```

Or run Pi with:

```bash
pi -e /Users/daniel/Developer/pi-linear/src/index.ts
```

## Usage

The extension registers a single `linear` tool with 13 actions:

| Action | Description |
|--------|-------------|
| `get_teams` | List teams with workflow states and labels |
| `search_issues` | Search issues by text, status, assignee, project, etc. |
| `get_issue` | Get full issue details with comments |
| `create_issue` | Create a new issue |
| `update_issue` | Update status, assignee, priority, labels, etc. |
| `create_comment` | Add a comment to an issue |
| `list_projects` | List projects with optional team filter |
| `get_project` | Get project details with milestones |
| `create_project` | Create a new project |
| `update_project` | Update project status, lead, dates, etc. |
| `list_milestones` | List milestones for a project |
| `create_milestone` | Create a project milestone |
| `update_milestone` | Update a milestone |

### Examples

```
You: What teams do I have in Linear?
Pi: [linear get_teams] → Lists all teams with states and labels

You: Create a high priority bug in Backend about auth token expiry
Pi: [linear create_issue] → BE-123: Auth token expiry (High, Bug)

You: Assign BE-123 to me and move to In Progress
Pi: [linear update_issue] → Updated BE-123

You: What are my issues this sprint?
Pi: [linear search_issues] → Lists your assigned issues

You: List all projects in the Backend team
Pi: [linear list_projects] → Shows projects with progress
```

## Development

```bash
cd /Users/daniel/Developer/pi-linear
npm install
```

Test with:

```bash
LINEAR_API_KEY="lin_api_xxx" pi -e ./src/index.ts
```
