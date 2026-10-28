#!/usr/bin/env python3
"""Block until a GitHub PR has something new to act on, then print it as JSON and exit.

Exit codes: 0 new events, 2 PR merged or closed, 3 timeout with no events, 1 gh kept failing.
Seen events persist in ~/.cache/watch-pr, so each run reports only what the last run did not.
"""

import argparse, json, subprocess, sys, time
from pathlib import Path

QUERY = """
query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      state url mergeable headRefName
      comments(last: 50) { nodes { databaseId author { login } body url } }
      reviews(last: 50) { nodes { databaseId author { login } state body url } }
      reviewThreads(first: 100) {
        nodes {
          id isResolved isOutdated path line
          comments(last: 1) { nodes { databaseId author { login } body url } }
        }
      }
      commits(last: 1) {
        nodes { commit { oid statusCheckRollup { contexts(first: 100) { nodes {
          __typename
          ... on CheckRun { name status conclusion detailsUrl }
          ... on StatusContext { context state targetUrl }
        } } } } }
      }
    }
  }
}
"""
# shortcut: reads the last 50 comments and reviews and the first 100 threads and checks, paginate if a PR outgrows that.

FAILED = {"FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ACTION_REQUIRED", "ERROR"}
PENDING = {"PENDING", "EXPECTED"}
MAX_BODY = 1500


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


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
        return {"name": node["name"], "state": state, "url": node["detailsUrl"], "pending": node["status"] != "COMPLETED"}
    return {"name": node["context"], "state": node["state"], "url": node["targetUrl"], "pending": node["state"] in PENDING}


def events(me: str, pr: dict) -> dict[str, dict]:
    """Map a stable key to each actionable fact. A key that changes means the fact is new."""
    found = {}
    for c in pr["comments"]["nodes"]:
        if author(c) != me:
            found[f"comment:{c['databaseId']}"] = {"type": "comment", "author": author(c), "body": c["body"][:MAX_BODY], "url": c["url"]}
    for r in pr["reviews"]["nodes"]:
        if author(r) != me and (r["body"] or r["state"] in {"CHANGES_REQUESTED", "APPROVED"}):
            found[f"review:{r['databaseId']}"] = {"type": "review", "author": author(r), "state": r["state"], "body": r["body"][:MAX_BODY], "url": r["url"]}
    for t in pr["reviewThreads"]["nodes"]:
        last = t["comments"]["nodes"][-1]
        if not t["isResolved"] and author(last) != me:
            found[f"thread:{last['databaseId']}"] = {
                "type": "thread", "thread_id": t["id"], "path": t["path"], "line": t["line"], "outdated": t["isOutdated"],
                "author": author(last), "body": last["body"][:MAX_BODY], "url": last["url"],
            }

    commit = pr["commits"]["nodes"][0]["commit"]
    sha = commit["oid"]
    checks = [check(n) for n in ((commit["statusCheckRollup"] or {}).get("contexts") or {}).get("nodes", [])]
    for c in checks:
        if c["state"] in FAILED:
            found[f"check:{sha}:{c['name']}:{c['state']}"] = {"type": "check_failed", "sha": sha, "name": c["name"], "state": c["state"], "url": c["url"]}
    if checks and not any(c["pending"] for c in checks) and not any(c["state"] in FAILED for c in checks):
        found[f"green:{sha}"] = {"type": "checks_passed", "sha": sha}
    if pr["mergeable"] == "CONFLICTING":
        found[f"conflict:{sha}"] = {"type": "merge_conflict", "sha": sha}
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pr", help="PR number, URL, or branch. A number or branch needs the repo as the working directory.")
    parser.add_argument("--interval", type=int, default=30, help="seconds between polls")
    parser.add_argument("--timeout", type=int, default=1500, help="seconds to wait before exit code 3")
    args = parser.parse_args()

    owner, name, number = resolve(args.pr)
    state_file = Path.home() / ".cache" / "watch-pr" / f"{owner}-{name}-{number}.json"
    seen = set(json.loads(state_file.read_text())) if state_file.exists() else set()
    deadline = time.monotonic() + args.timeout
    failures = 0

    while True:
        try:
            me, pr = fetch(owner, name, number)
            failures = 0
        except (subprocess.CalledProcessError, KeyError, TypeError) as error:
            failures += 1
            if failures >= 5:
                print(json.dumps({"type": "watch_error", "error": str(getattr(error, "stderr", None) or error)[:MAX_BODY]}))
                return 1
            time.sleep(args.interval)
            continue

        if pr["state"] != "OPEN":
            print(json.dumps({"type": "pr_" + pr["state"].lower(), "url": pr["url"]}))
            return 2

        found = events(me, pr)
        new = {k: v for k, v in found.items() if k not in seen}
        if new:
            state_file.parent.mkdir(parents=True, exist_ok=True)
            state_file.write_text(json.dumps(sorted(seen | new.keys())))
            print(json.dumps({"url": pr["url"], "branch": pr["headRefName"], "events": list(new.values())}, indent=1))
            return 0

        if time.monotonic() >= deadline:
            print(json.dumps({"type": "timeout", "url": pr["url"]}))
            return 3
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
