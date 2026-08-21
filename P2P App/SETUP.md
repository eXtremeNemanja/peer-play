# peer-play — Setup / how to run the project

The project's configuration files were lost. They have been reconstructed:

- `app/config.js` — backend configuration (placeholders, fill before running).
- `app/schema.sql` — PostgreSQL schema (`users`, `video` tables).

This document is the full run sequence. **For the four attack scenarios you only
need the Hardhat contract environment** (steps 1–3) — the attacker talks directly
to the blockchain node and never touches the backend. The full stack (steps 4–7)
is only needed to run the actual web app and requires PostgreSQL to be installed.

## Prerequisites
- Node.js (tested with v24) and npm.
- PostgreSQL **only for the full web app** (not installed by default here).

---

## Local files to create (git-ignored — recreate from here)

These two files are **not committed to the repo** (`app/.gitignore` blocks
`config.js` and `**/*.sql`). Recreate them locally from the content below.
Replace every `<PLACEHOLDER>` with a real value before running the backend.

> The attack scenarios in `docs/attacks/` do **not** need these files — they only
> need the Hardhat contract environment. These are required only for the full web app.

### `P2P App/app/config.js`

```javascript
// Reconstructed configuration for the peer-play backend (server.js).
// Git-ignored (app/.gitignore -> `config.js`). Fill in the placeholders.
// server.js imports exactly these six symbols (note the intentional typo COTRACT).

export const DB_CONFIG = {
    user: 'postgres',
    host: 'localhost',
    database: 'peerplay',
    password: '<DB_PASSWORD_PLACEHOLDER>',
    port: 5432,
};

// Local Hardhat JSON-RPC endpoint (the default printed by `npx hardhat node`).
export const ETHERS_PROVIDER = 'http://127.0.0.1:8545';

// JWT signing/verification secret.
export const JWT_SECRET = '<JWT_SECRET_PLACEHOLDER>';

// Deployed VideoStreaming address printed by scripts/deploy.js.
// (Keeps the original typo COTRACT — missing N — to match server.js.)
export const COTRACT_ADDRESS = '<CONTRACT_ADDRESS_FILL_AFTER_DEPLOY>';

// Path to the compiled ABI JSON bundled in app/contracts/.
export const CONTRACT_ABI_PATH = './contracts/VideoStreaming.json';

// Funded wallet private keys from the `npx hardhat node` account list.
// One is assigned round-robin to each registering user (stored in users.private_key).
export const WALLET_PRIVATE_KEYS = [
    '<HARDHAT_ACCOUNT_0_PRIVATE_KEY>',
    '<HARDHAT_ACCOUNT_1_PRIVATE_KEY>',
    '<HARDHAT_ACCOUNT_2_PRIVATE_KEY>',
    '<HARDHAT_ACCOUNT_3_PRIVATE_KEY>',
    '<HARDHAT_ACCOUNT_4_PRIVATE_KEY>',
];
```

### `P2P App/app/schema.sql`

```sql
-- PostgreSQL schema for the peer-play backend, reconstructed from server.js queries.
-- Git-ignored (app/.gitignore -> `**/*.sql`).
-- Usage:
--   createdb peerplay
--   psql -d peerplay -f schema.sql

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,   -- unique_violation handled at server.js:113
    password    TEXT NOT NULL,          -- bcrypt hash (server.js:103)
    private_key TEXT NOT NULL           -- assigned round-robin from WALLET_PRIVATE_KEYS
);

CREATE TABLE IF NOT EXISTS video (
    id       SERIAL PRIMARY KEY,
    owner    INTEGER NOT NULL REFERENCES users(id),
    filename TEXT NOT NULL,
    cid      TEXT NOT NULL UNIQUE       -- unique_violation handled at server.js:198
);
```

---

## Contract environment (needed for the attack scenarios)

```bash
# 1. Install contract dependencies
cd "P2P App/contract"
npm install

# 2. Compile
npx hardhat compile

# 3a. Start a local blockchain node (keep this terminal open).
#     It prints 20 funded test accounts + their private keys.
npx hardhat node

# 3b. In a second terminal, deploy the contract to that node:
cd "P2P App/contract"
npx hardhat run scripts/deploy.js --network localhost
#     -> prints:  VideoStreaming contract deployed to: 0x....
```

> Note: `contract/scripts/deploy.bat` runs `npx hardhat run deploy.js ...`, which is
> the wrong path. Run `npx hardhat run scripts/deploy.js --network localhost` from
> the `contract/` directory instead.

For the attack demos you can also just use `npx hardhat test` (in-process EVM) —
no separate node is required except for the front-running scenario, which needs a
real mempool (`npx hardhat node`). Each scenario guide in `docs/attacks/` has the
exact commands.

---

## Full web app (optional — needs PostgreSQL)

```bash
# 4. Create the database and tables
createdb peerplay
psql -d peerplay -f "P2P App/app/schema.sql"

# 5. Fill in P2P App/app/config.js:
#    - DB_CONFIG.password         -> your Postgres password
#    - JWT_SECRET                 -> any strong secret
#    - COTRACT_ADDRESS            -> address printed by deploy in step 3b
#    - WALLET_PRIVATE_KEYS        -> private keys printed by `hardhat node` in step 3a

# 6. Backend (port 3001)
cd "P2P App/app"
npm install
npm start

# 7. Frontend (port 3000)
cd "P2P App/client"
npm install
npm start
```

The client's API base URL is hardcoded to `http://localhost:3001/`
(`client/src/Api/Api.ts`), so no client config is required.
