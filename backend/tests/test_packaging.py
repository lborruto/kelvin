"""Static checks on the image recipe, the build context, the compose example and .env.example."""

import re
from pathlib import Path

from kelvin.config import Settings

ROOT = Path(__file__).resolve().parents[2]


def _read(name: str) -> str:
    return (ROOT / name).read_text()


def _final_stage(dockerfile: str) -> str:
    return dockerfile[dockerfile.rindex("\nFROM ") :]


def test_the_image_runs_the_launcher_as_an_unprivileged_user():
    final = _final_stage(_read("Dockerfile"))
    assert re.search(r"^USER 10001:10001$", final, re.M)
    assert re.search(r'^CMD \["python", "-m", "kelvin"\]$', final, re.M)
    assert "ENTRYPOINT" not in final
    assert re.search(r'^VOLUME \["/data"\]$', final, re.M)
    assert "install -d -o 10001 -g 10001 -m 0700 /data" in final
    assert "KELVIN_HOST=0.0.0.0" in final and "KELVIN_PORT=8080" in final


def test_the_last_user_of_the_final_stage_is_unprivileged():
    users = re.findall(r"^USER\s+(\S+)\s*$", _final_stage(_read("Dockerfile")), re.M)
    assert users, "the final stage sets no USER"
    assert users[-1] == "10001:10001", users  # nothing later switches back to root


def test_the_virtualenv_ships_no_world_writable_lock_file():
    # uv leaves /app/.venv/.lock mode 0666; the image must not carry a world-writable file.
    text = _read("Dockerfile")
    backend = text[text.index(" AS backend\n") : text.rindex("\nFROM ")]
    last_sync = backend.rindex("uv sync --locked --no-dev --no-editable")
    assert "rm -f /app/.venv/.lock" in backend[last_sync:]


def test_the_healthcheck_uses_python_not_curl():
    final = _final_stage(_read("Dockerfile"))
    health = re.search(r"^HEALTHCHECK .*?(?=^\S)", final, re.M | re.S).group(0)
    assert "/api/health" in health and "urllib.request" in health
    assert "127.0.0.1" in health
    assert "curl" not in health and "wget" not in health


def test_base_images_are_pinned_by_digest():
    text = _read("Dockerfile")
    images = re.findall(r"^FROM (\S+)", text, re.M) + re.findall(
        r"^COPY --from=(\S+:\S+)", text, re.M
    )
    assert images
    for image in images:
        assert re.search(r"@sha256:[0-9a-f]{64}$", image), image


FORWARDED = (
    "forwarded-allow-ips",
    "FORWARDED_ALLOW_IPS",
    "proxy-headers",
    "proxy_headers",
    "KELVIN_TRUSTED_PROXIES",
)


def test_nothing_shipped_trusts_forwarded_headers():
    for name in ("Dockerfile", "docker-compose.yml"):
        text = _read(name)
        assert [w for w in FORWARDED if w in text] == [], name


ALLOWED_IN_CONTEXT = {
    "backend/pyproject.toml",
    "backend/uv.lock",
    "backend/kelvin/",
    "web/package.json",
    "web/package-lock.json",
    "web/svelte.config.js",
    "web/vite.config.ts",
    "web/tsconfig.json",
    "web/src/",
    "web/static/",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
}


def test_the_build_context_keeps_secrets_data_and_caches_out():
    lines = [
        line.strip()
        for line in _read(".dockerignore").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    assert lines[0] == "**"  # everything is out unless re-included
    includes = [i for i, line in enumerate(lines) if line.startswith("!")]
    assert {lines[i][1:] for i in includes} == ALLOWED_IN_CONTEXT
    for deny in (
        "**/.env",
        "**/.env.*",
        "**/account.json",
        "**/*.db",
        "**/node_modules",
        "**/__pycache__",
    ):
        assert deny in lines, deny
        assert lines.index(deny) > max(includes), f"{deny} must come after every re-include"


def test_env_example_lists_every_setting_and_holds_no_secret():
    text = _read(".env.example")
    names = {m.group(1) for m in re.finditer(r"^#?\s*([A-Z][A-Z0-9_]*)=", text, re.M)}
    assert {field.upper() for field in Settings.model_fields} <= names
    for name in ("COZY_USER", "COZY_PASS", "MED_PRM", "MED_TOKEN"):
        # Credentials come from the login screen and Réglages: only an advanced, commented hint.
        assert re.search(rf"^# {name}=$", text, re.M), f"{name} must be a commented, empty hint"
        assert not re.search(rf"^{name}=", text, re.M), f"{name} must not be an active setting"


def test_compose_carries_no_credentials():
    """Login happens in the browser and Linky is set in Réglages: the compose file never asks
    for a password or a token."""
    text = _read("docker-compose.yml")
    for name in ("COZY_USER", "COZY_PASS", "MED_PRM", "MED_TOKEN"):
        assert name not in text, name


def test_compose_builds_locally_and_keeps_data_in_a_volume():
    text = _read("docker-compose.yml")
    assert re.search(r"^    build: \.$", text, re.M)
    assert '"8070:8080"' in text and "- data:/data" in text
    assert "read_only: true" in text and "no-new-privileges:true" in text
    assert "- ALL" in text and "privileged" not in text


def test_compose_says_who_must_own_the_data_volume():
    text = _read("docker-compose.yml")
    assert "chown -R 10001:10001 /data" in text
    assert "docker run --rm -u 0 -v kelvin_data:/data" in text


def test_readme_backup_is_private_and_outside_the_checkout():
    text = _read("README.md")
    section = text[text.index("### Upgrade, back up and restore") :]
    section = section[: section.index("\n## ")]
    assert '"$PWD"' not in section and "$PWD/" not in section
    assert '-v "$HOME":/backup' in section and "kelvin_data:/data:ro" in section
    assert "umask 077" in section and "chown $(id -u):$(id -g)" in section
    assert "kelvin-backup-$(date +%F).tgz" in section
    # Restore: stop, unpack into the volume as the image's user, start.
    restore = section[section.index("To restore") :]
    for step in (
        "docker compose stop",
        "tar xzf",
        "chown -R 10001:10001 /data",
        "docker compose start",
    ):
        assert step in restore, step
    assert restore.index("docker compose stop") < restore.index("tar xzf")
    assert restore.index("tar xzf") < restore.index("docker compose start")


def test_docs_warn_that_compose_interpolates_dollar_signs():
    for name in (".env.example", "README.md"):
        text = _read(name)
        assert "$$" in text and "interpolat" in text, name


def test_readme_recommends_the_host_allowlist():
    text = _read("README.md")
    assert "**Host allowlist (recommended):**" in text
    assert "DNS rebinding" in text
    assert "KELVIN_ALLOWED_HOSTS: ${KELVIN_ALLOWED_HOSTS:-}" in _read("docker-compose.yml")
    assert re.search(r"^KELVIN_ALLOWED_HOSTS=$", _read(".env.example"), re.M)


def test_backend_pins_the_python_minor_for_uv():
    assert _read("backend/.python-version").strip() == "3.13"


def test_compose_is_generic_for_any_self_hoster():
    text = _read("docker-compose.yml")
    assert "# image: ghcr.io/lborruto/kelvin:latest" in text
    # Built at runtime so the literal words never sit in a tracked file.
    for owner_specific in ("-".join(("oci", "box")), "Ko" + "modo", "ko" + "modo"):
        assert owner_specific not in text, owner_specific


def test_third_party_notices_cover_the_bundled_fonts():
    text = _read("THIRD_PARTY_NOTICES.md")
    assert "Onest" in text and "JetBrains Mono" in text and "SIL Open Font License 1.1" in text


def test_third_party_notices_summarise_the_runtime_and_the_base_image():
    text = _read("THIRD_PARTY_NOTICES.md")
    for name in ("Svelte", "SvelteKit", "d3-array", "internmap", "ISC", "Workbox"):
        assert name in text, name
    assert "Python Software Foundation License" in text
    assert "Debian" in text and "/usr/share/doc/" in text
    assert "not exhaustive" in text


WORKFLOWS = ROOT / ".github" / "workflows"


# A reusable workflow of this repository, called by path: it runs this commit's own file.
LOCAL_WORKFLOW = "./.github/workflows/"


def _workflows() -> dict[str, str]:
    # GitHub runs both extensions: a stray .yaml must not escape these checks.
    paths = sorted([*WORKFLOWS.glob("*.yml"), *WORKFLOWS.glob("*.yaml")])
    return {p.name: p.read_text() for p in paths}


def _run_blocks(text: str) -> list[str]:
    """Every `run:` script in a workflow: the inline value, or the indented block after it."""
    lines = text.splitlines()
    blocks = []
    for i, line in enumerate(lines):
        m = re.match(r"^(\s*(?:- )?)run: ?(.*)$", line)
        if not m:
            continue
        indent, value = len(m.group(1)), m.group(2)  # the column of the `run` key
        if value.strip() not in ("|", ">", "|-", ">-"):
            blocks.append(value)
            continue
        body = []
        for following in lines[i + 1 :]:
            if following.strip() and len(following) - len(following.lstrip()) <= indent:
                break
            body.append(following)
        blocks.append("\n".join(body))
    return blocks


def _job(text: str, name: str) -> str:
    """One job's text, from its key to the next job (or the end)."""
    rest = text[text.index(f"\n  {name}:\n") + 1 :]
    following = re.search(r"\n  [\w-]+:\n", rest)
    return rest if following is None else rest[: following.start() + 1]


def test_workflows_start_read_only_and_never_run_fork_code_with_secrets():
    flows = _workflows()
    assert set(flows) == {"ci.yml", "release.yml"}
    for name, text in flows.items():
        assert re.search(r"^permissions:\n  contents: read$", text, re.M), name
        assert "pull_request_target" not in text and "workflow_run" not in text, name
        # No untrusted event data in scripts (titles, branch names): script injection.
        assert "github.event." not in text and "head_ref" not in text, name
        assert "secrets." not in text.replace("secrets.GITHUB_TOKEN", ""), name
        assert "toJSON(" not in text and "printenv" not in text, name
    assert "packages: write" not in flows["ci.yml"]
    assert "id-token" not in flows["ci.yml"]


def test_actions_are_pinned_to_a_commit_and_checkout_drops_the_token():
    for name, text in _workflows().items():
        uses = [u for u in re.findall(r"uses: (\S+)", text) if not u.startswith(LOCAL_WORKFLOW)]
        assert uses, name
        for ref in uses:
            assert re.fullmatch(r"[\w.-]+/[\w./-]+@[0-9a-f]{40}", ref), f"{name}: {ref}"
        # Every pin names its release. The date is optional: Dependabot rewrites the version in
        # the comment but not a date, and its 14-day cooldown enforces the age rule.
        for line in re.findall(r"uses: (?!\./)\S+.*", text):
            assert re.search(r"@[0-9a-f]{40} # v\d+\.\d+\.\d+( \(\d{4}-\d{2}-\d{2}\))?$", line), (
                line
            )
        assert text.count("persist-credentials: false") == text.count("uses: actions/checkout@")


def test_no_expression_is_expanded_inside_a_run_script():
    # `${{ }}` is pasted into the script before the shell runs: values go through env: instead.
    for name, text in _workflows().items():
        scripts = _run_blocks(text)
        assert scripts, name
        assert [s for s in scripts if "${{" in s] == [], name


def test_run_blocks_are_found_inline_and_as_block_scalars():
    text = "    steps:\n      - run: echo one\n      - run: |\n          echo two\n        env:\n"
    assert _run_blocks(text) == ["echo one", "          echo two"]


def test_ci_lints_the_workflows_with_a_checksummed_actionlint():
    text = _workflows()["ci.yml"]
    lint = _job(text, "lint")
    assert re.search(r"ACTIONLINT_SHA256: [0-9a-f]{64}$", lint, re.M)
    assert re.search(r'ACTIONLINT_VERSION: "\d+\.\d+\.\d+"$', lint, re.M)
    assert "sha256sum -c" in lint  # verified before it is unpacked or run
    assert lint.index("sha256sum -c") < lint.index("tar ")
    assert "shellcheck" in lint  # actionlint checks run: scripts when shellcheck is on PATH
    assert "./actionlint" in lint


def test_ci_cancels_superseded_runs_only_for_pull_requests():
    text = _workflows()["ci.yml"]
    assert "cancel-in-progress: ${{ github.event_name == 'pull_request' }}" in text


def test_the_same_action_is_pinned_to_the_same_commit_everywhere():
    pins: dict[str, set[str]] = {}
    for text in _workflows().values():
        for action, sha in re.findall(r"uses: ([\w./-]+)@([0-9a-f]{40})", text):
            pins.setdefault(action, set()).add(sha)
    assert {action: shas for action, shas in pins.items() if len(shas) > 1} == {}


def test_release_pushes_only_from_a_tag():
    text = _workflows()["release.yml"]
    on = text[text.index("\non:\n") : text.index("\npermissions:\n")]
    assert set(re.findall(r"^  (\w+):", on, re.M)) == {"push", "workflow_dispatch"}
    assert re.search(r'^  push:\n    tags: \["v\*"\]$', text, re.M)
    assert "branches" not in on
    jobs = set(re.findall(r"^  ([\w-]+):$", text[text.index("\njobs:\n") :], re.M))
    assert jobs == {"checks", "publish", "dry-run"}

    publish = _job(text, "publish")
    assert "if: github.event_name == 'push' && github.ref_type == 'tag'" in publish
    assert re.search(
        r"^    permissions:\n      contents: read\n      packages: write$", publish, re.M
    )
    assert "push: true" in publish and "docker/login-action@" in publish
    assert "provenance: mode=max" in publish and "sbom: true" in publish
    # Index and manifest annotations; no shared Actions cache feeds the published image.
    assert "DOCKER_METADATA_ANNOTATIONS_LEVELS: manifest,index" in publish
    assert "cache-from" not in text and "cache-to" not in text and "type=gha" not in text

    dry = _job(text, "dry-run")
    assert "if: github.event_name == 'workflow_dispatch'" in dry
    assert "packages: write" not in dry and "login-action" not in dry
    assert "push: false" in dry and "push: true" not in dry
    for job in (publish, dry):
        assert "platforms: linux/amd64,linux/arm64" in job
    assert text.count("packages: write") == 1


def test_release_publishes_only_after_the_ci_checks_pass_on_the_tagged_commit():
    release = _workflows()["release.yml"]
    checks = _job(release, "checks")
    assert "if: github.event_name == 'push' && github.ref_type == 'tag'" in checks
    assert "uses: ./.github/workflows/ci.yml" in checks
    assert re.search(r"^    permissions:\n      contents: read$", checks, re.M)
    assert "secrets:" not in checks  # nothing is passed down; ci.yml needs none
    assert re.search(r"^    needs: \[?checks\]?$", _job(release, "publish"), re.M)
    ci_on = _workflows()["ci.yml"].split("\npermissions:\n")[0]
    assert re.search(r"^  workflow_call:$", ci_on, re.M)


def test_release_refuses_a_tag_that_does_not_match_both_versions():
    text = _job(_workflows()["release.yml"], "publish")
    assert "backend/pyproject.toml" in text and "web/package.json" in text
    assert '"$tag" != "$backend"' in text and '"$tag" != "$web"' in text
    assert "exit 1" in text


def test_ci_runs_every_check_and_the_image_smoke():
    text = _workflows()["ci.yml"]
    for command in (
        "uv run ruff check .",
        "uv run ruff format --check .",
        "uv run pytest -q",
        "npx vitest run",
        "npm run check",
        "npx playwright test",
        "shellcheck scripts/docker-smoke.sh",
        "bash scripts/docker-smoke.sh",
    ):
        assert command in text, command


def test_ci_runs_the_e2e_suite_against_the_built_image_too():
    text = _workflows()["ci.yml"]
    image = text[text.index("\n  image:\n") :]
    smoke = image.index("bash scripts/docker-smoke.sh")
    run = image.index("docker run -d")
    assert smoke < run < image.index("KELVIN_E2E_URL=")
    assert "-e KELVIN_FAKE=1" in image and "kelvin:smoke" in image
    assert "npx playwright test" in image[run:]


def test_ci_waits_for_the_container_health_without_noise():
    image = _job(_workflows()["ci.yml"], "image")
    assert "--retry-all-errors" not in image  # curl prints every refused connection
    assert "{{.State.Health.Status}}" in image


def test_playwright_can_target_a_running_kelvin_instead_of_starting_one():
    text = _read("web/playwright.config.ts")
    assert "process.env.KELVIN_E2E_URL" in text
    assert "webServer: external" in text


def test_dependabot_watches_every_ecosystem_weekly():
    text = (ROOT / ".github" / "dependabot.yml").read_text()
    for ecosystem in ("uv", "npm", "github-actions", "docker"):
        assert f'package-ecosystem: "{ecosystem}"' in text, ecosystem
    assert text.count('interval: "weekly"') == 4
    assert text.count("default-days: 14") == 4
    assert text.count("groups:") == 4
    assert 'dependency-name: "@sveltejs/kit"' in text


def test_product_md_describes_the_project_not_one_home():
    text = _read("PRODUCT.md")
    for private in (
        "reference home",
        "the household's",
        "User leaned",
        "User preference",
        "Evidence on Hand",
        "HEKLA",
        "IPALA",
    ):
        assert private not in text, private
    assert "## Product Principles" in text
