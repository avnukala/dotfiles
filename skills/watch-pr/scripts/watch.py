#!/usr/bin/env python3
"""Block until a GitHub PR has something new to act on, then print it as JSON and exit.

Exit codes: 0 new events, 2 PR merged or closed, 3 timeout with no events, 1 gh kept failing.
Seen events persist in ~/.cache/watch-pr, so each run reports only what the last run did not.
Each reported event also goes to ~/.cache/watch-pr/<owner>-<repo>-<number>.events.jsonl for later review learning.
"""

import argparse, json, os, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

QUERY = """
query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      state url mergeable headRefName isDraft isInMergeQueue mergeStateStatus reviewDecision
      comments(last: 50) { nodes { databaseId author { login } body url } }
      reviews(last: 50) { nodes { databaseId author { login } state body url } }
      reviewThreads(last: 100) {
        nodes {
          id isResolved isOutdated path line originalLine
          root: comments(first: 1) { nodes { diffHunk originalCommit { oid } } }
          comments(last: 1) { nodes { databaseId author { login } body url } }
        }
      }
      commits(last: 1) {
        nodes { commit { oid statusCheckRollup { contexts(first: 100) { pageInfo { hasNextPage } nodes {
          __typename
          ... on CheckRun { name status conclusion detailsUrl isRequired(pullRequestNumber: $number) }
          ... on StatusContext { context state targetUrl isRequired(pullRequestNumber: $number) }
        } } } } }
      }
    }
  }
}
"""
# shortcut: reads the last 50 comments and reviews and the last 100 threads, and the first 100 checks. The checks page flags `checks_truncated`.

FAILED = {"FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ACTION_REQUIRED", "ERROR"}
PENDING = {"PENDING", "EXPECTED"}
MAX_BODY = 1500
MAX_HUNK = 600
GH_TIMEOUT = 60
AUTH_ERRORS = ("auth", "401", "bad credentials")
NOISE_MARKERS = ("<!-- linear-linkback -->",)
CACHE = Path.home() / ".cache" / "watch-pr"


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True, timeout=GH_TIMEOUT).stdout


def resolve(pr: str) -> tuple[str, str, int]:
    url = json.loads(gh("pr", "view", pr, "--json", "url"))["url"]
    owner, name, _, number = url.removeprefix("https://github.com/").split("/")[:4]
    return owner, name, int(number)


def fetch(owner: str, name: str, number: int) -> tuple[str, dict]:
    out = gh("api", "graphql", "-f", f"query={QUERY}", "-f", f"owner={owner}", "-f", f"name={name}", "-F", f"number={number}")
    data = json.loads(out)["data"]
    return data["viewer"]["login"], data["repository"]["pullRequest"]


def author(node: dict) -> str:
    return (node.get("author") or {}).get("login", "ghost")


def check(node: dict) -> dict:
    if node["__typename"] == "CheckRun":
        state = node["conclusion"] or node["status"]
        return {"name": node["name"], "state": state, "url": node["detailsUrl"], "pending": node["status"] != "COMPLETED", "required": node["isRequired"]}
    return {"name": node["context"], "state": node["state"], "url": node["targetUrl"], "pending": node["state"] in PENDING, "required": node["isRequired"]}


def events(me: str, pr: dict) -> dict[str, dict]:
    """Map a stable key to each actionable fact. A key that changes means the fact is new."""
    found = {}
    for c in pr["comments"]["nodes"]:
        if author(c) != me and not any(marker in c["body"] for marker in NOISE_MARKERS):
            found[f"comment:{c['databaseId']}"] = {"type": "comment", "author": author(c), "body": c["body"][:MAX_BODY], "url": c["url"]}
    for r in pr["reviews"]["nodes"]:
        if author(r) != me and (r["body"] or r["state"] in {"CHANGES_REQUESTED", "APPROVED"}):
            found[f"review:{r['databaseId']}"] = {"type": "review", "author": author(r), "state": r["state"], "body": r["body"][:MAX_BODY], "url": r["url"]}
    for t in pr["reviewThreads"]["nodes"]:
        if t["isResolved"] or not t["comments"]["nodes"]:
            continue
        last = t["comments"]["nodes"][-1]
        if author(last) != me:
            root = t["root"]["nodes"][0]
            found[f"thread:{last['databaseId']}"] = {
                "type": "thread", "thread_id": t["id"], "path": t["path"], "line": t["line"] or t["originalLine"], "outdated": t["isOutdated"],
                "author": author(last), "body": last["body"][:MAX_BODY], "url": last["url"],
                "diff_hunk": root["diffHunk"][-MAX_HUNK:], "commit": root["originalCommit"]["oid"],
            }

    commit = pr["commits"]["nodes"][0]["commit"]
    sha = commit["oid"]
    contexts = (commit["statusCheckRollup"] or {}).get("contexts") or {}
    checks = [check(n) for n in contexts.get("nodes", [])]
    for c in checks:
        if c["state"] in FAILED:
            # The URL names the job, so a rerun that fails again is a new event.
            found[f"check:{sha}:{c['name']}:{c['url']}"] = {"type": "check_failed", "sha": sha, "name": c["name"], "state": c["state"], "url": c["url"], "required": c["required"]}
    if (contexts.get("pageInfo") or {}).get("hasNextPage"):
        found[f"truncated:{sha}"] = {"type": "checks_truncated", "sha": sha}
    elif checks and not any(c["pending"] for c in checks) and not any(c["state"] in FAILED for c in checks):
        found[f"green:{sha}"] = {"type": "checks_passed", "sha": sha}
    if pr["mergeable"] == "CONFLICTING":
        found[f"conflict:{sha}"] = {"type": "merge_conflict", "sha": sha}
    return found


def error_text(error: Exception) -> str:
    return str(getattr(error, "stderr", None) or error)[:MAX_BODY]


def append(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as file:
        file.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **record}) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pr", help="PR number, URL, or branch. A number or branch needs the repo as the working directory.")
    parser.add_argument("--interval", type=int, default=30, help="seconds between polls")
    parser.add_argument("--timeout", type=int, default=1500, help="seconds to wait before exit code 3")
    args = parser.parse_args()

    try:
        owner, name, number = resolve(args.pr)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"type": "watch_error", "error": error_text(error)}))
        return 1
    state_file = CACHE / f"{owner}-{name}-{number}.json"
    log_file = CACHE / f"{owner}-{name}-{number}.events.jsonl"
    seen = set(json.loads(state_file.read_text())) if state_file.exists() else set()
    deadline = time.monotonic() + args.timeout
    failures = 0

    while True:
        try:
            me, pr = fetch(owner, name, number)
            failures = 0
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, KeyError, TypeError) as error:
            failures += 1
            text = error_text(error)
            if failures >= 5 or any(marker in text.lower() for marker in AUTH_ERRORS):
                print(json.dumps({"type": "watch_error", "error": text}))
                return 1
            time.sleep(min(args.interval * 2 ** (failures - 1), 300))
            continue

        if pr["state"] != "OPEN":
            threads = [{"thread_id": t["id"], "resolved": t["isResolved"], "outdated": t["isOutdated"]} for t in pr["reviewThreads"]["nodes"]]
            append(log_file, {"type": "pr_" + pr["state"].lower(), "threads": threads})
            print(json.dumps({"type": "pr_" + pr["state"].lower(), "url": pr["url"], "events_log": str(log_file)}))
            return 2

        found = events(me, pr)
        new = {k: v for k, v in found.items() if k not in seen}
        if new:
            state_file.parent.mkdir(parents=True, exist_ok=True)
            tmp_file = state_file.with_suffix(".tmp")
            tmp_file.write_text(json.dumps(sorted(seen | new.keys())))
            os.replace(tmp_file, state_file)
            events_out = [{"key": k, **v} for k, v in new.items()]
            for event in events_out:
                append(log_file, event)
            # diff_hunk and commit are for the log. The agent reads the file at `path`.
            shown = [{k: v for k, v in e.items() if k not in {"diff_hunk", "commit"}} for e in events_out]
            merge = {k: pr[k] for k in ("isDraft", "isInMergeQueue", "mergeStateStatus", "reviewDecision")}
            print(json.dumps({"url": pr["url"], "branch": pr["headRefName"], **merge, "events": shown}, separators=(",", ":")))
            return 0

        if time.monotonic() >= deadline:
            print(json.dumps({"type": "timeout", "url": pr["url"]}))
            return 3
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
