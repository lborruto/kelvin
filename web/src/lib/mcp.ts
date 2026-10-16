/** Client configuration snippets for an MCP token (Plan 13). Commands and JSON, not copy: product
 * names and flags are the same in every language. */

export function endpointUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}${path}`;
}

export function claudeCodeSnippet(url: string, secret: string): string {
  return `claude mcp add --transport http kelvin ${url} --header "Authorization: Bearer ${secret}"`;
}

/** mcp-remote bridges Claude Desktop's stdio to HTTP; the header goes through env because some
 * Claude Desktop builds split arguments on spaces. */
export function claudeDesktopSnippet(url: string, secret: string): string {
  const config = {
    mcpServers: {
      kelvin: {
        command: "npx",
        args: [
          "-y",
          "mcp-remote",
          url,
          "--header",
          "Authorization:${KELVIN_MCP_AUTH}",
        ],
        env: { KELVIN_MCP_AUTH: `Bearer ${secret}` },
      },
    },
  };
  return JSON.stringify(config, null, 2);
}
