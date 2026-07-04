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
lines.append("## \u4e0b\u8f7d\u8bf4\u660e")
lines.append("")
lines.append("### macOS")
lines.append("")
lines.append("| \u6587\u4ef6 | \u9002\u7528\u573a\u666f | \u8bf4\u660e |")
lines.append("|---|----|---|")
lines.append("| Resound-Player-Mac-x64-" + version + ".dmg | **Intel \u82af\u7247** | DMG \u5b89\u88c5\u5305\uff0c\u62d6\u5165 Applications \u5373\u53ef |")
lines.append("| Resound-Player-Mac-arm64-" + version + ".dmg | **Apple \u82af\u7247** | DMG \u5b89\u88c5\u5305\uff0c\u62d6\u5165 Applications \u5373\u53ef |")
lines.append("")
# Read macOS tips from file
with open("deploy/release-macos-tips.md", "r", encoding="utf-8") as _f:
    for _line in _f:
        lines.append(_line.rstrip("\n"))
lines.append("")
lines.append("### Windows")
lines.append("")
lines.append("| \u6587\u4ef6 | \u9002\u7528\u573a\u666f | \u8bf4\u660e |")
lines.append("|---|----|---|")
lines.append("| Resound-Player Setup " + version + ".exe | **\u65e5\u5e38\u4f7f\u7528\uff08\u63a8\u8350\uff09** | NSIS \u5b89\u88c5\u5305\uff0c\u5b89\u88c5\u540e\u542f\u52a8\u5373\u65f6\uff0c\u4efb\u52a1\u680f\u56fe\u6807\u6b63\u786e\u663e\u793a |")
lines.append("| Resound-Player-" + version + ".exe | **U \u76d8\u643a\u5e26\u3001\u4e34\u65f6\u4f7f\u7528** | \u4fbf\u643a\u7248\uff0c\u514d\u5b89\u88c5\u76f4\u63a5\u8fd0\u884c |")
lines.append("")
lines.append("### Docker")
lines.append("```")
lines.append("docker run -d -p 38760:80 tingwensuojian/resound-player-server:" + version)
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