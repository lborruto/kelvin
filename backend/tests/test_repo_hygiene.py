"""What must never be committed: secrets, runtime data, captures, private material, and strings
that identify the owner."""

import importlib.util
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "backend" / "scripts"

pytestmark = pytest.mark.skipif(
    shutil.which("git") is None or not (ROOT / ".git").exists(), reason="needs a git checkout"
)


def _git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)


def _ignored(rel: str) -> bool:
    """Would git ignore this path (whether or not it exists)?"""
    return _git("check-ignore", "-q", "--no-index", rel).returncode == 0


def _tracked() -> list[str]:
    return [p for p in _git("ls-files", "-z").stdout.split("\0") if p]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(f"script_{name}", SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # top level only: main() is behind __main__
    return module


@pytest.mark.parametrize("name", ["med_capture", "capture_fixture"])
def test_capture_scripts_write_only_into_a_gitignored_directory(name):
    out: Path = _load(name).OUT
    target = out if out.suffix == ".json" else out / "probe.json"
    rel = str(target.relative_to(ROOT))
    assert _ignored(rel), f"{name}.py writes to {rel}, which git would commit"


@pytest.mark.parametrize(
    "rel",
    [
        ".env",
        ".env.local",
        "account.json",
        "backend/data/account.json",
        "data/kelvin.db",
        "backend/data/kelvin.db-wal",
        "backend/captures/med/daily.json",
        ".impeccable/design.json",
        ".superpowers/sdd/x.json",
        "docs/superpowers/plans/x.md",
        "kelvin-backup-2026-10-14.tgz",
        "backend/kelvin-data.tgz",
    ],
)
def test_private_paths_are_ignored(rel):
    assert _ignored(rel)


def test_the_env_example_is_not_ignored():
    assert not _ignored(".env.example")


def test_nothing_private_is_tracked():
    private_dirs = (".impeccable/", ".superpowers/", "docs/superpowers/", "backend/captures/")
    bad = [
        p
        for p in _tracked()
        if p.startswith(private_dirs)
        or Path(p).name in (".env", "account.json")
        or p.endswith((".db", ".db-wal", ".db-shm"))
    ]
    assert bad == []


# Strings that identify the owner, their employer, machines or private material. They are
# assembled at runtime so that this file never contains them: the release's history rewrite
# replaces them in every file, and this file must come out of it unchanged.
OWNER_SPECIFIC = {
    "employer": re.compile("agi" + "cap", re.I),
    # The GitHub handle (repository and image URLs, the copyright line) is public; the surname
    # alone is not.
    "surname": re.compile("(?<!l)" + "bor" + "ruto", re.I),
    "host name": re.compile("-".join(("oci", "box")), re.I),
    "deployment tool": re.compile("ko" + "modo", re.I),
    "machine path": re.compile(
        "|".join(re.escape(p) for p in ("/opt/" + "workspace", "/" + "Users/", "~/" + "cozy")),
        re.I,
    ),
    "the owner's home": re.compile(r"\breal[ -]" + "home" + r"\b", re.I),
}
# Pointers into private, gitignored material: the public docs must not send readers there.
PRIVATE_POINTERS = re.compile(r"\.impeccable/|\.superpowers/|docs/superpowers/", re.I)
# Files that name the private directories in order to exclude them.
POINTER_EXEMPT = {".gitignore", "scripts/docker-smoke.sh", "backend/tests/test_repo_hygiene.py"}
# Generated lockfiles, skipped at their real paths only: a file elsewhere with the same name is
# read like any other.
LOCKFILES = {"backend/uv.lock", "web/package-lock.json"}
BOMS = (
    (b"\xef\xbb\xbf", "utf-8-sig"),
    (b"\xff\xfe", "utf-16"),
    (b"\xfe\xff", "utf-16"),
)


def _decode(data: bytes) -> str | None:
    """Text from a file's bytes: Unicode with a byte-order mark is decoded (UTF-16 carries NUL
    bytes); anything else with a NUL byte is a binary, None."""
    for bom, codec in BOMS:
        if data.startswith(bom):
            return data.decode(codec, "replace")
    return None if b"\0" in data else data.decode("utf-8", "replace")


def _text(rel: str) -> str | None:
    """A tracked file's text, or None for binaries and the lockfiles."""
    if rel in LOCKFILES or not (ROOT / rel).is_file():
        return None
    return _decode((ROOT / rel).read_bytes())


def _hits(where: str, text: str, pointers: bool) -> list[str]:
    """Where `text` holds an owner-specific string or a private pointer, as `where:line: label`.
    A label only: never echo the value."""
    hits = []
    checks = list(OWNER_SPECIFIC.items())
    if pointers:
        checks.append(("pointer to private material", PRIVATE_POINTERS))
    for label, pattern in checks:
        for match in pattern.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            hits.append(f"{where}:{line}: {label}")
    return hits


def test_no_owner_specific_strings_in_tracked_files():
    hits = []
    for rel in _tracked():
        text = _text(rel)
        if text is not None:
            hits += _hits(rel, text, pointers=rel not in POINTER_EXEMPT)
    assert hits == []


def test_no_owner_specific_strings_in_tracked_file_names():
    hits = []
    for rel in _tracked():
        hits += [f"file name {hit}" for hit in _hits("path", rel, pointers=True)]
    assert hits == []


def test_the_guard_reads_utf16_and_byte_order_marks():
    word = "agi" + "cap"
    assert _decode(word.encode("utf-16")) == word  # BOM + NUL-bearing UTF-16
    assert _decode(b"\xfe\xff" + word.encode("utf-16-be")) == word
    assert _decode(b"\xef\xbb\xbf" + word.encode()) == word
    assert _decode(b"\x89PNG\0\0" + word.encode()) is None  # a real binary stays skipped


def test_the_guard_patterns_ignore_case():
    assert _hits("x", "see /" + "OPT/" + "Workspace/x", pointers=False) == ["x:1: machine path"]
    assert _hits("x", "a " + ".SuperPowers" + "/b", pointers=True) == [
        "x:1: pointer to private material"
    ]


def test_lockfiles_are_skipped_only_at_their_real_paths():
    assert _text("backend/" + "uv.lock") is None
    assert _text("web/" + "package-lock.json") is None
    assert _text("LICENSE") is not None
    assert "docs/uv.lock" not in LOCKFILES and "uv.lock" not in LOCKFILES


LINK = re.compile(r"\]\(([^)\s]+)\)")


def test_relative_links_in_markdown_resolve():
    """Every relative link in a tracked Markdown file names a tracked file or directory: a link
    into gitignored material would resolve here and break in a fresh clone."""
    tracked = _tracked()
    present = set(tracked) | {str(parent) for t in tracked for parent in Path(t).parents}
    broken = []
    for rel in tracked:
        if not rel.endswith(".md") or not (ROOT / rel).is_file():
            continue
        for target in LINK.findall((ROOT / rel).read_text(encoding="utf-8")):
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            path = target.split("#", 1)[0]
            if not path:
                continue
            resolved = ((ROOT / rel).parent / path).resolve()
            if not resolved.is_relative_to(ROOT) or str(resolved.relative_to(ROOT)) not in present:
                broken.append(f"{rel} -> {target}")
    assert broken == []


FENCE = re.compile(r"^(```|~~~).*?^\1", re.M | re.S)
HEADING = re.compile(r"^#{1,6}[ \t]+(.+?)[ \t#]*$", re.M)


def _slug(heading: str) -> str:
    """GitHub's anchor for a heading: the text without Markdown, lowercased, punctuation dropped
    (but `-` and `_`), spaces to `-`."""
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", heading).replace("`", "")
    return re.sub(r"[^\w\- ]", "", text.strip().lower()).replace(" ", "-")


def _anchors(markdown: str) -> set[str]:
    """Every heading anchor of a Markdown file, with GitHub's -1, -2… for repeats."""
    seen: dict[str, int] = {}
    anchors = set()
    for heading in HEADING.findall(FENCE.sub("", markdown)):
        slug = _slug(heading)
        n = seen.get(slug, 0)
        seen[slug] = n + 1
        anchors.add(slug if n == 0 else f"{slug}-{n}")
    return anchors


def test_github_heading_slugs():
    assert _slug("Security model — read this before installing") == (
        "security-model--read-this-before-installing"
    )
    assert _slug("Quick start (Docker Compose)") == "quick-start-docker-compose"
    assert _slug("Use `KELVIN_DATA` and [the docs](x.md)!") == "use-kelvin_data-and-the-docs"
    assert _anchors("# A\n```\n# not a heading\n```\n## A\n") == {"a", "a-1"}


def test_fragment_links_in_markdown_point_at_a_heading():
    """`#fragment` links, in-page or into another tracked Markdown file, name a real heading."""
    broken = []
    for rel in _tracked():
        if not rel.endswith(".md") or not (ROOT / rel).is_file():
            continue
        text = (ROOT / rel).read_text(encoding="utf-8")
        for target in LINK.findall(FENCE.sub("", text)):
            if target.startswith(("http://", "https://", "mailto:")) or "#" not in target:
                continue
            path, fragment = target.split("#", 1)
            file = (ROOT / rel).parent / path if path else ROOT / rel
            if file.suffix != ".md" or not file.is_file():
                continue  # a missing file is the relative-link test's finding
            if fragment not in _anchors(file.read_text(encoding="utf-8")):
                broken.append(f"{rel} -> {target}")
    assert broken == []


GATEWAY_ID = re.compile(r"(?<![0-9])\d{4}-\d{4}-\d{4}(?![0-9])")
# The simulator's gateway ids, invented: the sample house and the three Plan 12 brand houses.
# Assembled so that this file never contains them either.
SIMULATOR_GATEWAYS = {
    "-".join(parts)
    for parts in (
        ("1234", "5678", "9012"),
        ("2345", "6789", "0123"),
        ("3456", "7890", "1234"),
        ("4567", "8901", "2345"),
    )
}
SIMULATOR_GATEWAY = "-".join(("1234", "5678", "9012"))


def test_only_the_simulator_gateway_ids_appear_in_tracked_files():
    """Overkiz gateway ids identify a home: the only ones allowed are the simulator's four."""
    found = []
    for rel in _tracked():
        text = _text(rel)  # None for binaries and the lockfiles
        if text is None:
            continue
        for n, line in enumerate(text.splitlines(), 1):
            if any(m.group(0) not in SIMULATOR_GATEWAYS for m in GATEWAY_ID.finditer(line)):
                found.append(f"{rel}:{n}")  # the location only, never the value
    assert not found, found


# Device serials (the number in a device URL, an « IO (…) » label or a radiator path; Kelvin's
# radiator id is its heater's serial) identify real hardware: the only ones allowed are the
# simulator's, invented. Short numbers (`…/1#2`) are obviously invented and pass.
SERIAL = re.compile(
    r"://\d{4}-\d{4}-\d{4}/(\d{5,})"  # a device URL
    r"|%2F(\d{5,})"  # an encoded device URL
    r"|IO \((\d{5,})"  # Overkiz's generic label
    r"|/radiators/(\d{5,})"  # an API path
    r"|[\"'`](\d{7,8})(?:#\d+)?[\"'`]"  # a quoted id, with or without its `#n`
)
SIMULATOR_SERIALS = {
    # the sample (Sauter) house: four heaters and the IO bridge
    "10000001",
    "9500003",
    "9000011",
    "9000022",
    "1900001",
    # the Atlantic, Thermor and experimental houses
    *(f"{brand}00000{n}" for brand in ("21", "31", "41") for n in range(1, 5)),
    *(f"170000{n}" for n in range(1, 4)),
    # the scrubbing example in errors.py and its tests
    "5432187",
}


def test_only_the_simulator_serials_appear_in_tracked_files():
    """A real-looking serial cannot slip into code, tests, fixtures or docs. Like the other
    checks here, this reads the files at HEAD only: what an earlier commit held is cleaned by
    rewriting history before a release, not by this test."""
    found = []
    for rel in _tracked():
        text = _text(rel)
        if text is None:
            continue
        for n, line in enumerate(text.splitlines(), 1):
            for m in SERIAL.finditer(line):
                if next(g for g in m.groups() if g) not in SIMULATOR_SERIALS:
                    found.append(f"{rel}:{n}")  # the location only, never the value
    assert not found, found


def test_the_serial_guard_reads_every_context():
    s = "765432"  # assembled: this file must pass its own scan
    text = (
        f"io://1234-5678-9012/{s}1#1 IO ({s}2) /api/radiators/{s}3 '{s}4' \"{s}50#2\" "
        f"io%3A%2F%2F1234-5678-9012%2F{s}6 io://1234-5678-9012/1#2"
    )
    hits = [next(g for g in m.groups() if g) for m in SERIAL.finditer(text)]
    assert hits == [s + "1", s + "2", s + "3", s + "4", s + "50", s + "6"]
