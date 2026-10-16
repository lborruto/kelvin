import { describe, expect, it } from "vitest";
import { claudeCodeSnippet, claudeDesktopSnippet, endpointUrl } from "./mcp";

const SECRET = "kmcp_" + "a".repeat(43);

describe("mcp snippets", () => {
  it("builds the endpoint from the page origin", () => {
    expect(endpointUrl("https://kelvin.lan/", "/mcp")).toBe(
      "https://kelvin.lan/mcp",
    );
    expect(endpointUrl("http://192.168.1.5:8080", "/mcp")).toBe(
      "http://192.168.1.5:8080/mcp",
    );
  });
  it("Claude Code: an HTTP server with the bearer header", () => {
    expect(claudeCodeSnippet("https://kelvin.lan/mcp", SECRET)).toBe(
      `claude mcp add --transport http kelvin https://kelvin.lan/mcp --header "Authorization: Bearer ${SECRET}"`,
    );
  });
  it("Claude Desktop: mcp-remote with the header in env", () => {
    const cfg = JSON.parse(
      claudeDesktopSnippet("https://kelvin.lan/mcp", SECRET),
    );
    expect(cfg.mcpServers.kelvin.command).toBe("npx");
    expect(cfg.mcpServers.kelvin.args).toEqual([
      "-y",
      "mcp-remote",
      "https://kelvin.lan/mcp",
      "--header",
      "Authorization:${KELVIN_MCP_AUTH}",
    ]);
    expect(cfg.mcpServers.kelvin.env.KELVIN_MCP_AUTH).toBe(`Bearer ${SECRET}`);
  });
});
