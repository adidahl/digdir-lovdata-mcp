# Vercel MCP Deployment

This repository can run on Vercel as a Streamable HTTP MCP server at
`/api/mcp`.

## Deployment Shape

The full local SQLite database includes Norsk Lovtidend provenance and is too
large for Vercel Hobby:

- full `data/database.db`: about 849 MB
- Vercel Node function bundle limit: 250 MB
- Vercel function writable `/tmp` scratch space: 500 MB

For Vercel testing, use the current-law database:

- current laws and central regulations included
- Lovtidend provenance omitted
- generated file: `data/database.vercel-current.db`
- expected size: about 132 MB

The Vercel function downloads that database from Vercel Blob into `/tmp` on the
first cold start. Keep the Blob public for this test deployment; the source data
is already public Lovdata publicData.

## Build The Vercel Database

```bash
npm run build:db:vercel-current
shasum -a 256 data/database.vercel-current.db
```

## Upload The Database To Vercel Blob

Create or connect a Vercel Blob store, then upload:

```bash
npx vercel blob put data/database.vercel-current.db \
  --pathname database.vercel-current.db \
  --allow-overwrite
```

Save the returned Blob URL.

Set production environment variables:

```bash
npx vercel env add DIGDIR_NORWEGIAN_LAW_DB_URL production
npx vercel env add DIGDIR_NORWEGIAN_LAW_DB_SHA256 production
```

Use the Blob URL for `DIGDIR_NORWEGIAN_LAW_DB_URL` and the `shasum` value for
`DIGDIR_NORWEGIAN_LAW_DB_SHA256`.

## Deploy

```bash
npx vercel deploy --prod
```

After deployment:

```bash
curl https://<your-project>.vercel.app/api/health
```

Use this MCP endpoint in ChatGPT or another Streamable HTTP client:

```text
https://<your-project>.vercel.app/api/mcp
```

## Local Vercel Test

```bash
npm run build:db:vercel-current
npm run dev:vercel
```

Then connect an MCP inspector to:

```text
http://localhost:3000/api/mcp
```
