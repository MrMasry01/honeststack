#!/usr/bin/env python3
"""
hs-db.py - HonestStack database helper.

Runs SQL against the HonestStack Supabase project through the Supabase
Management API, so the honeststack-editor skill works with or without the
Supabase MCP -- including unattended, as the scheduled morning-brief routine.

Usage
    python hs-db.py query.sql            # run SQL read from a file
    echo "select 1;" | python hs-db.py   # run SQL read from stdin

Config is read from ~/.claude/honeststack/state.json:
    { "supabase_project_ref": "<ref>", "supabase_pat": "sbp_..." }

Output: the result rows as JSON on stdout. Exit code is non-zero on any
error (bad config, HTTP error, SQL error) with a message on stderr.
"""
import json
import os
import sys
import urllib.error
import urllib.request

STATE_PATH = os.path.expanduser("~/.claude/honeststack/state.json")
API = "https://api.supabase.com/v1/projects/{ref}/database/query"

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


def die(msg):
    sys.stderr.write("hs-db: " + str(msg) + "\n")
    sys.exit(1)


def main():
    try:
        with open(STATE_PATH, encoding="utf-8") as fh:
            cfg = json.load(fh)
    except Exception as exc:
        die("cannot read %s: %s" % (STATE_PATH, exc))

    ref = cfg.get("supabase_project_ref")
    pat = cfg.get("supabase_pat")
    if not ref or not pat:
        die("state.json is missing 'supabase_project_ref' or 'supabase_pat'")

    if len(sys.argv) > 1:
        try:
            with open(sys.argv[1], encoding="utf-8") as fh:
                sql = fh.read()
        except Exception as exc:
            die("cannot read SQL file %s: %s" % (sys.argv[1], exc))
    else:
        sql = sys.stdin.read()

    if not sql.strip():
        die("no SQL given -- pass a .sql file path or pipe SQL on stdin")

    payload = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        API.format(ref=ref),
        data=payload,
        method="POST",
        headers={
            "Authorization": "Bearer " + pat,
            "Content-Type": "application/json",
            "User-Agent": "honeststack-editor/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        die("HTTP %s from Supabase: %s" % (exc.code, body))
    except Exception as exc:
        die("request failed: %s" % exc)

    try:
        parsed = json.loads(raw)
    except Exception:
        sys.stdout.write(raw + "\n")
        return
    sys.stdout.write(json.dumps(parsed, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
