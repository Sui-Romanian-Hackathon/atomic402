import { Hono } from "hono";
import { cors } from "hono/cors";
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { createX402Server } from "@repo/sdk";
import type {
  ContentMetadata,
  SignedTransactionRequest,
  ApiResponse,
} from "@repo/shared/types";

const app = new Hono();

// Enable CORS for frontend
app.use("/*", cors());

// ===== Configuration =====
const NETWORK = process.env.SUI_NETWORK || "testnet";
const RPC_URL =
  process.env.SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";
const PACKAGE_ID = process.env.PACKAGE_ID || "DEPLOY_AND_UPDATE_THIS";

// Initialize Sui client
const suiClient = new SuiClient({ url: RPC_URL });

// Initialize sponsor keypair (for gasless transactions)
// In production, use secure key management
let sponsorKeypair: Ed25519Keypair | undefined;
if (process.env.SPONSOR_PRIVATE_KEY) {
  sponsorKeypair = Ed25519Keypair.fromSecretKey(
    Buffer.from(process.env.SPONSOR_PRIVATE_KEY, "hex")
  );
}

// Initialize x402 server SDK
const x402Server = createX402Server({
  suiClient,
  packageId: PACKAGE_ID,
  sponsorKeypair,
});

// ===== In-Memory Content Storage =====
// In production, this would be a database
interface StoredContent extends ContentMetadata {
  actualContent: string; // The premium content itself
}

const contentStore = new Map<string, StoredContent>();

// Sample content (will be populated with real on-chain content)
const sampleContents: Omit<StoredContent, "id">[] = [
  {
    title: "Understanding x402 on Sui",
    description: "Deep dive into how x402 protocol works on Sui blockchain",
    price: "100000000", // 0.1 SUI in MIST
    contentUrl: "ipfs://QmX123...",
    creator: "0x1234567890abcdef1234567890abcdef12345678",
    actualContent: `# Understanding x402 on Sui

This is premium content that explains how x402 works on Sui...

The key innovation is that payment and access grant happen atomically in a single transaction!

With Sui's programmable transaction blocks (PTBs), we can:
1. Transfer payment to content creator
2. Mint access receipt NFT
3. All in ONE indivisible transaction

No verification delay. No polling. No trust issues.`,
  },
  {
    title: "Programmable Transaction Blocks Guide",
    description: "Learn how to build complex PTBs on Sui",
    price: "200000000", // 0.2 SUI
    contentUrl: "ipfs://QmY456...",
    creator: "0x1234567890abcdef1234567890abcdef12345678",
    actualContent: `# PTB Mastery

Programmable Transaction Blocks are Sui's superpower...

[Premium detailed content here]`,
  },
  {
    title: "Building DeFi on Sui",
    description: "Complete guide to DeFi development on Sui",
    price: "500000000", // 0.5 SUI
    contentUrl: "ipfs://QmZ789...",
    creator: "0x1234567890abcdef1234567890abcdef12345678",
    actualContent: `# DeFi on Sui

Learn how to build the next generation of DeFi protocols...

[Premium detailed content here]`,
  },
];

// Initialize sample content in store
sampleContents.forEach((content, index) => {
  const id = `content_${index + 1}`;
  contentStore.set(id, { ...content, id });
});

// ===== API Routes =====

app.get("/", (c) => {
  return c.json({
    message: "x402 on Sui - Payment Required Protocol",
    version: "1.0.0",
    network: NETWORK,
    endpoints: {
      health: "/health",
      contents: "/content",
      content: "/content/:id",
      execute: "/content/:id/execute",
    },
  });
});

app.get("/health", (c) => {
  return c.json({ status: "ok", network: NETWORK, packageId: PACKAGE_ID });
});

/**
 * GET /content
 * List all available content
 */
app.get("/content", (c) => {
  const contents = Array.from(contentStore.values()).map((content) => ({
    id: content.id,
    title: content.title,
    description: content.description,
    price: content.price,
    creator: content.creator,
  }));

  return c.json({ success: true, data: contents });
});

/**
 * GET /content/:id
 * Request specific content
 * Returns 402 if user doesn't have access, or content if they do
 */
app.get("/content/:id", async (c) => {
  const contentId = c.req.param("id");
  const userAddress = c.req.query("address");

  const content = contentStore.get(contentId);
  if (!content) {
    return c.json({ success: false, error: "Content not found" }, 404);
  }

  // Check if user has access (if address provided)
  if (userAddress && PACKAGE_ID !== "DEPLOY_AND_UPDATE_THIS") {
    try {
      const hasAccess = await x402Server.hasAccess(userAddress, contentId);
      if (hasAccess) {
        // User has access - return the actual content
        return c.json({
          success: true,
          data: {
            id: content.id,
            title: content.title,
            content: content.actualContent,
          },
        });
      }
    } catch (error) {
      console.error("Access check failed:", error);
    }
  }

  // User doesn't have access - return 402 Payment Required
  try {
    if (!userAddress) {
      return c.json({ success: false, error: "User address required" }, 400);
    }

    const x402Response = await x402Server.generateX402Response(
      {
        id: content.id,
        title: content.title,
        description: content.description,
        price: content.price,
        contentUrl: content.contentUrl,
        creator: content.creator,
      },
      userAddress
    );

    return c.json(x402Response, 402);
  } catch (error) {
    console.error("Failed to generate x402 response:", error);
    return c.json(
      { success: false, error: "Failed to generate payment request" },
      500
    );
  }
});

/**
 * POST /content/:id/execute
 * Accept signed transaction, sponsor, and execute
 */
app.post("/content/:id/execute", async (c) => {
  const contentId = c.req.param("id");

  try {
    const body = await c.req.json<SignedTransactionRequest>();

    if (!body.transactionBytes || !body.signature || !body.publicKey) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    // Sponsor and execute the transaction
    const result = await x402Server.sponsorAndExecute(
      body.transactionBytes,
      body.signature,
      body.publicKey
    );

    return c.json({
      success: result.status === "success",
      data: {
        digest: result.digest,
        status: result.status,
        explorer: `https://suiscan.xyz/${NETWORK}/tx/${result.digest}`,
      },
    });
  } catch (error: any) {
    console.error("Transaction execution failed:", error);
    return c.json(
      {
        success: false,
        error: error.message || "Transaction execution failed",
      },
      500
    );
  }
});

/**
 * GET /receipts/:address
 * Get all access receipts for an address
 */
app.get("/receipts/:address", async (c) => {
  const address = c.req.param("address");

  if (PACKAGE_ID === "DEPLOY_AND_UPDATE_THIS") {
    return c.json({ success: false, error: "Package not deployed yet" }, 503);
  }

  try {
    const objects = await suiClient.getOwnedObjects({
      owner: address,
      filter: {
        StructType: `${PACKAGE_ID}::content_access::AccessReceipt`,
      },
      options: { showContent: true },
    });

    const receipts = objects.data
      .filter(
        (obj) => obj.data?.content && obj.data.content.dataType === "moveObject"
      )
      .map((obj) => {
        const fields = obj.data!.content!.fields as any;
        return {
          id: obj.data!.objectId,
          contentId: fields.content_id,
          contentTitle: Buffer.from(fields.content_title).toString("utf8"),
          pricePaid: fields.price_paid,
          timestamp: fields.timestamp,
        };
      });

    return c.json({ success: true, data: receipts });
  } catch (error: any) {
    console.error("Failed to fetch receipts:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== Server Start =====

const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

console.log(`🚀 x402 Server starting on port ${port}`);
console.log(`📦 Network: ${NETWORK}`);
console.log(`🔗 RPC: ${RPC_URL}`);
console.log(`📝 Package ID: ${PACKAGE_ID}`);

if (sponsorKeypair) {
  console.log(`💰 Sponsor enabled: ${sponsorKeypair.toSuiAddress()}`);
} else {
  console.log(`⚠️  No sponsor key - users will pay their own gas`);
}

export default {
  port,
  fetch: app.fetch,
};
