# Chrome Web Store Listing Assets

This directory contains all assets and copy needed for the Chrome Web Store listing.

## Files

| File | Purpose | Required dimensions |
|------|---------|-------------------|
| `copy.md` | All text fields (title, summary, description, permissions, privacy) | N/A |
| `promo-tile-small.svg` | Small promotional tile | 440x280 px |
| `screenshot-1-browse.svg` | Screenshot: Browse storage keys | 1280x800 px |
| `screenshot-2-editor.svg` | Screenshot: JSON editor with One Dark theme | 1280x800 px |
| `screenshot-3-monitoring.svg` | Screenshot: Real-time change monitoring | 1280x800 px |
| `screenshot-4-diff.svg` | Screenshot: Inline diff view | 1280x800 px |
| `screenshot-5-import-export.svg` | Screenshot: Import/Export with JSON file | 1280x800 px |

## Converting SVGs to PNGs

The Chrome Web Store requires PNG or JPEG uploads. Convert the SVGs:

```bash
# Using Chromium (most accurate rendering)
for f in *.svg; do
  chromium --headless --screenshot="${f%.svg}.png" --window-size=1280,800 "$f" 2>/dev/null
done

# Or using Inkscape
for f in *.svg; do
  inkscape "$f" --export-type=png --export-filename="${f%.svg}.png"
done

# Or using rsvg-convert (brew install librsvg)
for f in *.svg; do
  rsvg-convert "$f" -o "${f%.svg}.png"
done
```

## Uploading to Chrome Web Store

1. Go to https://chrome.google.com/webstore/devconsole
2. Select the extension
3. Go to **Store Listing** tab
4. Paste text from `copy.md` into the appropriate fields
5. Upload the PNG versions of the screenshots and promo tile
6. Go to **Privacy** tab and fill in fields from the copy.md privacy section
7. Save and publish

## Privacy Policy

The privacy policy lives at `docs/privacy-policy.md` and is hosted via GitHub Pages at:
`https://pete-the-pete.github.io/local-storage-inspector/privacy-policy`
