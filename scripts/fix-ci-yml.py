import re

path = r"C:\Users\93402\Documents\Resound-Player\.github\workflows\build-win.yml"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Find and remove the hardcoded NotesFile block
notes_start = content.find("# Build release notes with all platform info")
notes_end = content.find("gh release view \", notes_start)

if notes_start < 0 or notes_end < 0:
    print("ERROR: could not find notes block")
    exit(1)

# Remove the notes generation block
content = content[:notes_start] + content[notes_end:]

# Fix gh release edit - remove --notes-file
old_edit = 'gh release edit \ --title "Resound-Player v\" --notes-file \'
new_edit = 'gh release edit \ --title "Resound-Player v\"'
content = content.replace(old_edit, new_edit)

# Fix gh release create - remove --notes-file, add placeholder
old_create = 'gh release create \ --target \ --title "Resound-Player v\" --notes-file \'
new_create = 'gh release create \ --target \ --title "Resound-Player v\" --notes "\\u6784\\u5efa\\u4e2d\\uff0c\\u8bf7\\u7a0d\\u540e\\u67e5\\u770b\\u5b8c\\u6574\\u53d1\\u5e03\\u8bf4\\u660e.."'
content = content.replace(old_create, new_create)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("DONE - build-win.yml fixed")
