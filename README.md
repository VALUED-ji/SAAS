# Zhaoji Technology Renovation SaaS

## Local Development

Install dependencies and start the local development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3459](http://localhost:3459).

## Local Verification

Run the complete local verification before creating a release:

```bash
npm run verify:local
```

This checks React Hook dependencies, TypeScript, security invariants, the local SQLite database in read-only mode, and the production build.

Run the full lint report separately when cleaning historical warnings:

```bash
npm run lint
```

## Clean Release Archive

After local verification passes, create a source-only release archive:

```bash
npm run release:clean -- stability-phase3-YYYYMMDD-v1
```

The archive excludes `.env` files, the local database, uploaded business files, backups, and macOS extended metadata. The script also creates a SHA-256 checksum beside the archive.
