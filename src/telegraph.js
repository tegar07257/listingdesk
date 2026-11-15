// Telegraph access layer for ListingDesk.
// Drives the official Telegraph MCP server (@telegraphprotocol/
// telegraph-protocol-mcp) as a subprocess and exposes the small surface
// ListingDesk needs: account preflight, intent metadata, rankings, asks.
import { McpClient } from "./mcp-client.js";

export const NODE_URL = process.env.TELEGRAPH_URL || "https://devnode.telegraphprotocol.com";
export const NETWORK_NOTE =
  "Telegraph beta 2 on Ethereum Sepolia (testnet). Test USDC only; no real funds.";

export class Telegraph {
  constructor(home) {
    this.client = new McpClient(
      "npx",
      ["-y", "@telegraphprotocol/telegraph-protocol-mcp"],
      { TELEGRAPH_HOME: home, TELEGRAPH_URL: NODE_URL },
    );
  }

  async start() { await this.client.init(); }
  close() { this.client.close(); }

  async account() { return this.client.callTool("telegraph_account", {}); }
  async intent(name) { return this.client.callTool("telegraph_intent", { intent: name }); }
  async ranking(intent) { return this.client.callTool("telegraph_ranking", { intent }); }
  async findMiners(intent, limit = 5) {
    return this.client.callTool("telegraph_find_miners", { intent, limit });
  }

  // One paid machine-to-machine purchase through the supported flow.
  // Paid from the local Telegraph escrow by the official MCP server;
  // a failed ask is never billed by the network.
  async ask({ intent, params, question }) {
    const args = {};
    if (intent) args.intent = intent;
    if (params) args.params = params;
    if (question) args.question = question;
    return this.client.callTool("telegraph_ask", args, 240_000);
  }
}
