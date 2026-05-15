# Slack + ngrok Setup

Use this for a local Slack-controlled S.T.A.R.K instance.

S.T.A.R.K can start without a project `WORKFLOW.md`. If the file exists, it uses that workflow. If it does not, it falls back to a built-in parent workflow for Slack-created agent jobs.

## Slack App

1. Create a Slack app at [https://api.slack.com/apps](https://api.slack.com/apps).
2. Add bot token scopes:

- `app_mentions:read`
- `chat:write`
- `commands`
- `files:write`
- `im:history`

1. Install the app to your workspace and copy the bot token.
2. Copy the app signing secret from **Basic Information**.

## Local Tunnel

```sh
ngrok http 4000
```

Use the HTTPS forwarding URL from ngrok as your public base URL.

## Slack URLs

Set these Slack app URLs:

- Slash command request URL: `https://<ngrok-host>/slack/commands`
- Event subscriptions request URL: `https://<ngrok-host>/slack/events`
- Interactivity request URL: `https://<ngrok-host>/slack/interactions`

Subscribe to the `app_mention` bot event if you want to talk to S.T.A.R.K by mentioning the app in a channel. Subscribe to `message.im` if you also want to DM the app.

## Environment

```sh
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_SIGNING_SECRET=...
export STARK_PUBLIC_BASE_URL=https://<ngrok-host>
export SLACK_ALLOWED_CHANNELS=C0123456789
export STARK_ARTIFACT_ROOTS=./assets,~/stark-workspaces
export STARK_GITHUB_REPO_ROOTS=~/stark-workspaces
```

Leave `SLACK_ALLOWED_USERS` unset if anyone in the allowed channel should be able to mention or command the app.

With `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` set, Slack mode is enabled automatically. You can force-disable it with `STARK_SLACK_ENABLED=false`.

## Workflow Config

```yaml
slack:
  enabled: true
  bot_token: $SLACK_BOT_TOKEN
  signing_secret: $SLACK_SIGNING_SECRET
  allowed_channel_ids:
    - C0123456789
  public_base_url: $STARK_PUBLIC_BASE_URL
  artifact_roots:
    - ./assets
    - ~/stark-workspaces
github:
  enabled: true
  allowed_repo_roots:
    - ~/stark-workspaces
```

## Commands

- `/stark status`
- `/stark refresh`
- `/stark issue STARK-123`
- `/stark update the project and file a PR`
- `/stark artifact anvil graphic`
- `/stark approvals`
- `/stark approve appr-...`
- `/stark reject appr-...`
- `/stark pr ~/stark-workspaces/STARK-123 "Update landing page"`
- `/stark new-project openclaw app with auth and dashboard`

By default, artifact uploads, GitHub PR creation, and new project creation require approval before execution. Agent tasks (mentions and free-form messages) run immediately.
