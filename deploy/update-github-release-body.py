"""Update GitHub Release body with proper UTF-8 content."""
import json, os, subprocess, urllib.request

tag = os.environ.get("GITHUB_REF_NAME", "")
if not tag:
    print("No GITHUB_REF_NAME, skipping")
    exit(0)

version = tag.lstrip("v")
gh_token = os.environ.get("GH_TOKEN", "")

# Build release notes
lines = []
lines.append("# Resound-Player v" + version)
lines.append("")
lines.append("## \u66f4\u65b0\u5185\u5bb9")

# Get previous tag for commit log
result = subprocess.run(
    ["git", "tag", "--sort=-version:refname"],
    capture_output=True, text=True, check=True
)
tags = [t.strip() for t in result.stdout.strip().split("\n") if t.strip()]
if len(tags) >= 2:
    prev_tag = tags[1]
    log_result = subprocess.run(
        ["git", "log", prev_tag + ".." + tag, "--no-merges", "--oneline", "--reverse"],
        capture_output=True, text=True, check=True
    )
    for line in log_result.stdout.strip().split("\n"):
        line = line.strip()
        if line:
            parts = line.split(" ", 1)
            if len(parts) > 1:
                lines.append("- " + parts[1])

lines.append("")
lines.append("---")
lines.append("")
lines.append("## \u5b89\u88c5\u8bf4\u660e")
lines.append("")
lines.append("### macOS")
lines.append("1. \u4e0b\u8f7d\u5bf9\u5e94\u67b6\u6784\u7684 .dmg \u6587\u4ef6\uff08Apple Silicon \u9009 arm64\uff0cIntel \u9009 x64\uff09")
lines.append("2. \u6253\u5f00\u540e\u62d6\u5165 Applications \u6587\u4ef6\u5939")
lines.append("3. \u9996\u6b21\u6253\u5f00\u82e5\u63d0\u793a\u65e0\u6cd5\u9a8c\u8bc1\u5f00\u53d1\u8005\uff0c\u9700\u524d\u5f80 \u7cfb\u7edf\u8bbe\u7f6e > \u9690\u79c1\u4e0e\u5b89\u5168\u6027 > \u4ecd\u8981\u6253\u5f00")
lines.append("")
lines.append("### Windows")
lines.append("1. \u4e0b\u8f7d Resound-Player-Setup-v" + version + ".exe")
lines.append("2. \u53cc\u51fb\u8fd0\u884c\u5b89\u88c5")
lines.append("")
lines.append("### Docker")
lines.append("```")
lines.append("docker run -d -p 80:80 tingwensuojian/resound-player-server:" + version)
lines.append("```")
lines.append("")
lines.append("## \u6821\u9a8c\u8bf4\u660e")
lines.append("")
lines.append("SHA256 \u6821\u9a8c\u503c\u89c1 Release \u9644\u4ef6\u4e2d\u7684 .blockmap \u6587\u4ef6\u3002")
body = "\n".join(lines)

# Get release ID
url = "https://api.github.com/repos/tingwensuojian/Resound-Player/releases/tags/" + tag
req = urllib.request.Request(url, headers={
    "Authorization": "token " + gh_token,
    "Accept": "application/vnd.github.v3+json"
})
with urllib.request.urlopen(req) as resp:
    release = json.loads(resp.read())
    release_id = release["id"]

# Update release body
payload = json.dumps({"body": body}).encode("utf-8")
url2 = "https://api.github.com/repos/tingwensuojian/Resound-Player/releases/" + str(release_id)
req2 = urllib.request.Request(url2, data=payload, method="PATCH", headers={
    "Authorization": "token " + gh_token,
    "Content-Type": "application/json"
})
with urllib.request.urlopen(req2) as resp2:
    print("Release body updated (status " + str(resp2.status) + ")")