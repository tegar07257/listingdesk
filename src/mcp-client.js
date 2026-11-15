// Minimal MCP stdio client (JSON-RPC over newline-delimited JSON).
// Used to drive the official Telegraph MCP server as a subprocess — the
// supported integration surface for agent apps.
import { spawn } from "node:child_process";

export class McpClient {
  constructor(command, args, env = {}) {
    this.proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    this.buf = "";
    this.pending = new Map();
    this.nextId = 1;
    this.stderr = "";
    this.proc.stdout.on("data", (d) => {
      this.buf += d.toString();
      let idx;
      while ((idx = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, idx).trim();
        this.buf = this.buf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id && this.pending.has(msg.id)) {
          this.pending.get(msg.id)(msg);
          this.pending.delete(msg.id);
        }
      }
    });
    this.proc.stderr.on("data", (d) => { this.stderr += d.toString(); });
  }

  send(obj) { this.proc.stdin.write(JSON.stringify(obj) + "\n"); }

  request(method, params, timeoutMs = 120_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  async init(clientName = "listingdesk", clientVersion = "0.1.0") {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: clientName, version: clientVersion },
    });
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  // Returns { ok, data, text, raw } — data is parsed JSON when the tool
  // returns JSON text, otherwise null and the raw text is preserved.
  async callTool(name, args = {}, timeoutMs = 180_000) {
    const res = await this.request("tools/call", { name, arguments: args }, timeoutMs);
    const result = res.result ?? null;
    const text = result?.content?.map((c) => c.text ?? "").join("\n") ?? "";
    let data = null;
    try { data = JSON.parse(text); } catch { /* free-form text answer */ }
    return { ok: !result?.isError && !res.error, isError: !!result?.isError || !!res.error, data, text, raw: res };
  }

  close() { try { this.proc.kill(); } catch { /* already gone */ } }
}
