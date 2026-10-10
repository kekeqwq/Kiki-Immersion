"""Isolated Chromium regression test; mock AI only, no userscript extensions."""
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parent.parent


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class ResultsParser(HTMLParser):
    results = None

    def handle_starttag(self, _tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id") == "results" and "data-results" in attrs:
            self.results = json.loads(attrs["data-results"])


def main():
    chrome = os.environ.get("CHROME_BIN") or shutil.which("google-chrome") or shutil.which("chromium")
    if not chrome:
        mac_chrome = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        if mac_chrome.exists():
            chrome = str(mac_chrome)
    if not chrome:
        raise SystemExit("Set CHROME_BIN to a Chromium/Chrome executable.")
    subprocess.run(["python3", "scripts/bundle.py"], cwd=ROOT, check=True)
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="kiki-asbplayer-test-") as profile:
            command = [
                chrome, "--headless", "--disable-gpu", "--disable-extensions",
                "--no-first-run", "--no-default-browser-check",
                "--user-data-dir=" + profile, "--virtual-time-budget=20000", "--dump-dom",
                f"http://127.0.0.1:{server.server_port}/test/netflix-asbplayer.html",
            ]
            if hasattr(os, "geteuid") and os.geteuid() == 0:
                command.insert(1, "--no-sandbox")
            completed = subprocess.run(command, capture_output=True, text=True, timeout=60, check=True)
            parser = ResultsParser()
            parser.feed(completed.stdout)
            if not parser.results:
                raise SystemExit("Fixture did not finish. Chrome stderr:\n" + completed.stderr[-2000:])
            for result in parser.results:
                print(("PASS " if result["passed"] else "FAIL ") + result["label"])
            if len(parser.results) < 24 or not all(result["passed"] for result in parser.results):
                raise SystemExit(1)
            print(f"{len(parser.results)} checks passed (mock AI; isolated profile).")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
