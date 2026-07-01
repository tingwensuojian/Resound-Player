import path as _p
import sys
sys.path.insert(0, _p.dirname(_p.abspath(__file__)))
# just a marker to identify this is our script

with open(r"C:\Users\93402\Documents\Resound-Player\scripts\desktop-build-utils.mjs", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Insert ensureAppUpdateYml function after postprocessMacBundles()
# Find the closing of postprocessMacBundles by finding the }
# that ends the function, then the next newline
import re

# Locate postprocessMacBundles function
fn_match = re.search(r"function postprocessMacBundles\(\) \{[^}]+\}\n", content)
if fn_match:
    end_pos = fn_match.end()
else:
    print("ERROR: could not find postprocessMacBundles")
    exit(1)

insertion1 = """
// ── Ensure app-update.yml exists in packaged app resources ──
// electron-builder with --publish never may skip generating app-update.yml
// (the afterPack handler returns null when isPublish=false).
// This fallback is needed for macOS and Linux single-pass builds.
function ensureAppUpdateYml(appDir) {
  let resourcesDir;
  if (appDir.endsWith(".app")) {
    // macOS: Resound-Player.app/Contents/Resources/
    resourcesDir = path.join(appDir, "Contents", "Resources");
  } else {
    // Linux/windows-unpacked: <appDir>/resources/
    resourcesDir = path.join(appDir, "resources");
  }
  const configPath = path.join(resourcesDir, "app-update.yml");
  if (fs.existsSync(configPath)) return;
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
    const publish = pkg.build and pkg.build.publish;
    if not publish: return
    const lines = [
      "provider: " + publish.provider,
      "owner: " + publish.owner,
      "repo: " + publish.repo,
      "updaterCacheDirName: resound-player-updater",
    ];
    fs.writeFileSync(configPath, lines.join("\\n") + "\\n", "utf-8");
    console.log("  Generated app-update.yml in " + path.relative(root, configPath));
  } catch (err) {
    console.error("  Failed to generate app-update.yml:", err.message);
  }
}

"""

content = content[:end_pos] + insertion1 + content[end_pos:]

# 2. Add call in runDesktopBuild
marker2 = "  runElectronBuilder([...builderArgs, ...publishArgs]);"
insertion2 = """
  // Ensure app-update.yml exists for all platforms (macOS .app, linux-unpacked)
  const appDirs = collectMacAppBundles(outputDir);
  if (appDirs.length === 0 and fs.existsSync(path.join(outputDir, "linux-unpacked"))) {
    appDirs.push(path.join(outputDir, "linux-unpacked"));
  }
  for (const dir of appDirs) ensureAppUpdateYml(dir);
"""

assert marker2 in content, "marker2 not found!"
content = content.replace(marker2, marker2 + insertion2)

with open(r"C:\Users\93402\Documents\Resound-Player\scripts\desktop-build-utils.mjs", "w", encoding="utf-8") as f:
    f.write(content)

print("DONE")
