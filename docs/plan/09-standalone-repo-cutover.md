# 09 - Standalone Repo Cutover

## Goal

Move the contained Digdir project into its own standalone repository.

The result should be a clean repository that can build, test, run locally, and
produce a Docker image without depending on the original reference repo.

## Scope

In scope:

- Copy folder contents to a fresh repository.
- Initialize Git in the new repo.
- Add final `.gitignore`.
- Confirm package metadata and docs.
- Confirm local and Docker verification.
- Prepare first commit.

Out of scope:

- NPM publishing.
- Production deployment automation.
- EU/EEA feature work.
- Case-law or preparatory works expansion.

## Implementation Steps

1. Create a new empty repository directory outside the reference repo.

2. Copy the contents of `digdir-norwegian-law-mcp/` into that directory.

3. Remove generated files that should not be committed:

   - `node_modules/`
   - `dist/`
   - `coverage/`
   - temporary logs.

4. Decide whether to commit `data/database.db`:

   - commit it if the hosted package should include a ready-to-run DB.
   - ignore it if CI or deployment will build it from seed files.
   - for the MVP, default to committing seed JSON and building DB in release
     or Docker steps.

5. Initialize Git:

   ```bash
   git init
   git add .
   git status --short
   ```

6. Review package metadata:

   - package name.
   - license.
   - repository URL.
   - author/maintainer.
   - README quick start.

7. Add GitHub Actions later only after local validation is stable.

8. Create first commit after validation passes.

## Verification

From the new standalone repo:

```bash
npm ci
npm run build
npm run build:db
npm test
npm run smoke:stdio
PORT=3000 npm run start:http
curl http://localhost:3000/health
docker build -t digdir-norwegian-law-mcp .
```

Manual:

- Confirm no imports reference files outside the standalone repo.
- Confirm README instructions work from a clean checkout.
- Confirm the Docker image does not depend on the original repo path.

## Done Criteria

- Standalone Git repo exists.
- Fresh install works.
- Build, DB build, tests, stdio smoke, HTTP health, and Docker build pass.
- README and package metadata match Digdir Norwegian Law MCP.
- Original reference repo is no longer needed to run the project.

