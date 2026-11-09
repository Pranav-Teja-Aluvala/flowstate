# Activate the GitHub App connection

## Start with a public repository — no App setup

In a project's Code & GitHub page, paste an HTTPS GitHub repository URL into
**Connect public repository**. FLOWSTATE checks that GitHub exposes it publicly,
creates a shared copy when you start a code session, and lets workspace editors
work on that copy. Each saved source file can be downloaded. This mode does not
grant GitHub write permission and cannot publish remotely. Anonymous GitHub
request limits apply; public GET responses are cached for five minutes.

The existing GitHub App path below remains required for private repositories and
creating branches/pull requests. No user access token is borrowed from the
operator, and a public connection never falls back to private credentials.

FLOWSTATE now includes a GitHub App user-authorization integration. Each collaborator connects their own GitHub account. FLOWSTATE membership alone does not grant private repository access. Repository reads and publishing use the intersection of the user’s GitHub access and the App’s selected-repository installation permissions.

## Register the app

1. In GitHub, open **Settings → Developer settings → GitHub Apps → New GitHub App**. Use a unique name for your FLOWSTATE installation.
2. For local development, set the homepage to `http://localhost:3000` and the callback URL to `http://localhost:3000/api/github/callback`.
3. Keep expiring user access tokens enabled. Webhooks are not used by this implementation, so disable the webhook rather than providing a fake URL. Device authorization is not required.
4. Request repository **Contents: Read and write**, **Pull requests: Read and write**, and the automatically required **Metadata: Read-only**. No Actions, Workflows, organization administration, or broad personal-access-token scopes are needed. Workflow-file changes may be rejected because the App intentionally does not request workflow permissions.
5. Choose whether the app may be installed only on your account or on the company organization. Company installation requires the organization’s normal approval process.
6. Create the app and generate a client secret. This implementation uses user-to-server authorization; an installation private key is not needed. Note the Client ID and the app’s URL slug.

GitHub’s [user access token documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app) describes this authorization flow. Do not paste the client secret, encryption key, or access tokens into chat or commit them.

## Configure the checkout

Set these values in both root `.env` and `apps/web/.env.local`:

```dotenv
APP_URL=http://localhost:3000
GITHUB_CLIENT_ID=your-real-app-client-id
GITHUB_CLIENT_SECRET=your-real-client-secret
GITHUB_APP_SLUG=your-actual-github-app-slug
GITHUB_TOKEN_KEY=64-hex-characters
```

Generate a token-encryption key when setting up a fresh checkout:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the same encryption key for the web, collaboration, and runner services. A key has already been generated in the ignored environment files of this development checkout. Keep it when adding the real app credentials. Changing it invalidates stored credentials; disconnect/reconnect accounts or perform a controlled key migration. Access and refresh tokens are encrypted with AES-256-GCM in PostgreSQL. The client secret stays in environment configuration.

Restart the web and collaboration services after setting credentials. Apply migrations with `npm run db:migrate`.

## Connect a company project

1. Open the project’s **Code & GitHub** area and choose **Authorize GitHub**.
2. Follow **Install or manage selected repositories**, choose **Only select repositories**, and select the intended company repository. Return to FLOWSTATE and refresh.
3. A FLOWSTATE owner/admin who also has GitHub write access chooses the installed repository and selects **Connect repository**.
4. Each teammate authorizes their own GitHub account. They must be a project workspace member and have GitHub access to that repository.
5. An editor with GitHub write access starts a code session from a branch and opens a text file. Other authorized members can join the same session. Viewers remain read-only even if they own an unrelated FLOWSTATE workspace.
6. Wait for saved-state feedback, provide a PR title, and select **Create branch & pull request**. FLOWSTATE creates a separate `flowstate/...` branch and opens a PR; it does not push directly to the base branch. If the base changed, start a new session. Review and run repository checks on GitHub before merging.

The app does not automatically merge or deploy code. A failed GitHub operation can leave a newly created branch without a PR; inspect GitHub before retrying. Publishing is an explicit snapshot of saved buffers, not a transaction across active clients and GitHub. Opening a file pins its initial source to the session’s base commit and preserves executable-file modes. Binary files, symlinks, and submodules are not editable.

## Verification boundaries

The automated integration and browser tests use a deliberately mocked GitHub API with artificial credentials. They exercise real application authorization, source-file initialization, collaboration, persistence, PR request construction, viewer restrictions, and unavailable-runner handling. No company repository or live GitHub App was used for these tests. Live authorization, selected-repository installation, refresh-token renewal, and a real PR still require verification after supplying your App credentials.

The test mock is imported only by `playwright.code.config.ts` startup commands. Normal application startup never loads it.
