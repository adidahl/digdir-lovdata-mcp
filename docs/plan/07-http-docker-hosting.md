# 07 - HTTP Docker Hosting

## Goal

Add online hosting support with Streamable HTTP and Docker, using bundled
read-only SQLite.

The result should be a Docker image that starts a long-running Node MCP HTTP
server and serves `/health` plus `/mcp`.

## Scope

In scope:

- `src/http-server.ts`.
- Streamable HTTP MCP transport.
- Session management for MCP clients.
- `GET /health`.
- Dockerfile.
- Docker smoke checks.
- Bundled `data/database.db`.

Out of scope:

- Vercel/serverless hosting.
- PostgreSQL or external database services.
- Kubernetes-specific manifests.
- Authentication, unless added later.

## Implementation Steps

1. Implement `src/http-server.ts`:

   - open `data/database.db` read-only.
   - support `DIGDIR_NORWEGIAN_LAW_DB_PATH`.
   - create a fresh MCP `Server` per HTTP session.
   - register the same tools as stdio.
   - expose `POST /mcp`, `GET /mcp`, and `DELETE /mcp`.
   - expose CORS headers for MCP clients.

2. Implement `GET /health`:

   - return `status`, `server`, `version`, `uptime_seconds`.
   - run `SELECT 1` against SQLite.
   - return HTTP `503` if DB check fails.

3. Add package scripts:

   - `start:http`: `node dist/http-server.js`
   - `dev:http`: `node --import tsx src/http-server.ts`

4. Add Dockerfile:

   - build TypeScript in a builder stage.
   - install production dependencies in runtime stage.
   - copy `dist/`.
   - copy `data/database.db`.
   - set `DIGDIR_NORWEGIAN_LAW_DB_PATH=/app/data/database.db`.
   - install `tar` and `bzip2` in build stages that run archive sync.
   - run as a non-root user.
   - command: `node dist/http-server.js`.

5. Add Docker build documentation:

   ```bash
   npm run build:db
   docker build -t digdir-norwegian-law-mcp .
   docker run --rm -p 3000:3000 digdir-norwegian-law-mcp
   ```

6. Do not add Vercel files in this milestone.

## Verification

Local HTTP:

```bash
npm run build
npm run build:db
PORT=3000 npm run start:http
curl http://localhost:3000/health
curl http://localhost:3000/mcp
```

Docker:

```bash
docker build -t digdir-norwegian-law-mcp .
docker run --rm -p 3000:3000 digdir-norwegian-law-mcp
curl http://localhost:3000/health
```

Manual:

- Connect an MCP client to `http://localhost:3000/mcp`.
- Confirm tools list and `about` works.

## Done Criteria

- HTTP server starts locally.
- `/health` returns OK with DB status.
- Docker image builds.
- Docker container serves `/health`.
- MCP client can connect over Streamable HTTP.
- SQLite remains bundled and read-only.
