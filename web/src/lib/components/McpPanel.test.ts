import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "$lib/api/client";
import type { McpAuditRow, McpTokenList } from "$lib/api/types";
import { applyLocale } from "$lib/i18n";
import McpPanel from "./McpPanel.svelte";

const media = vi.hoisted(() => ({ desktop: { matches: true } }));
vi.mock("$lib/media.svelte", () => media);
vi.mock("$lib/api/client", () => ({
  api: {
    mcpTokens: vi.fn(),
    createMcpToken: vi.fn(),
    revokeMcpToken: vi.fn(),
    mcpAudit: vi.fn(),
  },
  ApiError: class extends Error {},
}));

const now = Date.now() / 1000;
const SECRET = "kmcp_" + "b".repeat(39) + "x7Qa";
const list = (): McpTokenList => ({
  enabled: true,
  endpoint_path: "/mcp",
  tokens: [
    {
      id: "00000000000000a1",
      name: "Claude Code",
      hint: "k3Zp",
      scope: "read",
      created: now - 86400,
      last_used: now - 120,
      revoked_at: null,
    },
    {
      id: "00000000000000a2",
      name: "Ancien",
      hint: "Q9we",
      scope: "read",
      created: now - 9e5,
      last_used: null,
      revoked_at: now - 3600,
    },
  ],
});
const audit: McpAuditRow[] = [
  {
    at: now - 120,
    token_name: "Claude Code",
    kind: "tool",
    name: "get_energy",
    outcome: "ok",
    error_code: null,
    duration_ms: 84,
    count: 1,
  },
  {
    at: now - 60,
    token_name: null,
    kind: "auth",
    name: "authenticate",
    outcome: "denied",
    error_code: "invalid_token",
    duration_ms: 0,
    count: 300,
  },
];

beforeEach(() => {
  vi.mocked(api.mcpTokens).mockReset().mockResolvedValue(list());
  vi.mocked(api.mcpAudit).mockReset().mockResolvedValue(audit);
  vi.mocked(api.revokeMcpToken).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.createMcpToken)
    .mockReset()
    .mockResolvedValue({
      token: {
        id: "00000000000000a3",
        name: "Claude",
        hint: "x7Qa",
        scope: "read",
        created: now,
        last_used: null,
        revoked_at: null,
      },
      secret: SECRET,
    });
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  applyLocale("fr");
  document.querySelectorAll('[role="menu"]').forEach((n) => n.remove());
});

describe("McpPanel", () => {
  it("a skeleton, then the tokens, their last call and the recent calls", async () => {
    const { container } = render(McpPanel);
    expect(container.querySelector(".skeleton")).not.toBeNull();
    expect(
      await screen.findByText("Claude Code", {
        selector: ".name",
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("…k3Zp")).toBeInTheDocument();
    expect(screen.getByText(/dernier appel il y a 2\smin/)).toBeInTheDocument();
    expect(screen.getByText(/révoqué le /)).toBeInTheDocument();
    expect(screen.getByText("get_energy")).toBeInTheDocument();
    // refused attempts are one counted row: the count is shown, never hidden
    const refused = screen.getByText(/^jeton inconnu · refusé/);
    expect(refused.textContent!.replace(/\s+/g, " ")).toMatch(/^jeton inconnu · refusé · 300 fois · /);
    // a revoked token has no actions
    expect(
      screen.getByRole("button", { name: "Actions pour Claude Code" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Actions pour Ancien" }),
    ).toBeNull();
  });

  it("creates a token and shows its secret once, with both snippets", async () => {
    render(McpPanel);
    await screen.findByText("…k3Zp");
    await fireEvent.click(
      screen.getByRole("button", { name: "Créer un jeton" }),
    );
    expect(api.createMcpToken).toHaveBeenCalledWith("Claude");
    expect(await screen.findByText(SECRET)).toBeInTheDocument();
    expect(
      screen.getByText(/claude mcp add --transport http kelvin http/),
    ).toBeInTheDocument();
    expect(screen.getByText(/mcp-remote/, { selector: 'pre' })).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole("button", { name: "J’ai copié le jeton" }),
    );
    await waitFor(() => expect(screen.queryByText(SECRET)).toBeNull());
  });

  it("revokes from the row’s menu, after a confirmation", async () => {
    render(McpPanel);
    await fireEvent.click(
      await screen.findByRole("button", { name: "Actions pour Claude Code" }),
    );
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: /Révoquer/ }),
    );
    expect(api.revokeMcpToken).not.toHaveBeenCalled();
    expect(
      screen.getByText("Révoquer « Claude Code » ?", {
        normalizer: (s) => s.replace(/ /g, " "),
      }),
    ).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Révoquer" }));
    expect(api.revokeMcpToken).toHaveBeenCalledWith("00000000000000a1");
  });

  it("says when the server has MCP turned off", async () => {
    vi.mocked(api.mcpTokens).mockResolvedValue({
      enabled: false,
      endpoint_path: "/mcp",
      tokens: [],
    });
    render(McpPanel);
    expect(
      await screen.findByText("L’accès MCP est désactivé sur ce serveur."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Créer un jeton" })).toBeNull();
  });

  it("reads in English", async () => {
    applyLocale("en");
    render(McpPanel);
    expect(
      await screen.findByRole("button", { name: "Create a token" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/last call 2\smin ago/)).toBeInTheDocument();
  });
});
