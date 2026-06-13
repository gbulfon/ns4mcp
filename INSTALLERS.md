# Building the installers

NS4MCP ships **zero-prerequisite installers** for macOS, Windows, and Linux. Each
one bundles a portable Node runtime + the built app + its production
`node_modules` (with only the one matching `@julusian/midi` native prebuild), and
auto-configures Claude Desktop. The end user installs nothing else.

Everything is built in CI by [`.github/workflows/release.yml`](.github/workflows/release.yml).
Push a tag like `v0.1.0` to build and publish a GitHub Release; use the **Run
workflow** button to build artifacts without releasing.

## Layout

```
installers/
  build-bundle.mjs      # download Node + assemble runtime/ + app/ for one OS/arch
  configure-claude.mjs  # add/remove the nord-stage-4 entry in claude_desktop_config.json
  macos/
    distribution.xml    # productbuild UI + min-OS
    entitlements.plist  # hardened-runtime entitlements for the bundled node
    scripts/postinstall # runs as root; configures the console user's Claude config
  windows/ns4mcp.iss    # Inno Setup (per-user install, unsigned)
  linux/install.sh      # copy to ~/.local/share/ns4mcp + configure
  linux/uninstall.sh
```

The bundle that ends up installed:

```
<install>/runtime/node[.exe]     portable Node 22 LTS
<install>/app/dist/...           compiled server + schema
<install>/app/node_modules/...   production deps, one midi prebuild
<install>/configure-claude.mjs   the config patcher (run on (un)install)
```

Claude Desktop is pointed at `<install>/runtime/node <install>/app/dist/index.js`.

## Build one bundle locally

```bash
npm run build
node installers/build-bundle.mjs --platform darwin --arch arm64 --out /tmp/ns4-macos-arm64
# then dry-run it:
/tmp/ns4-macos-arm64/runtime/node /tmp/ns4-macos-arm64/app/dist/index.js --dry-run
# and exercise the patcher against a throwaway home:
/tmp/ns4-macos-arm64/runtime/node /tmp/ns4-macos-arm64/configure-claude.mjs \
  --install --install-dir /tmp/ns4-macos-arm64 --home /tmp/fakehome
```

`--platform` is `darwin|win32|linux`, `--arch` is `x64|arm64`. The Node version is
pinned in `build-bundle.mjs` (`NODE_BUNDLE_VERSION`).

## Per-OS notes

- **macOS** — built as a `.pkg`. `pkgbuild` lays the bundle into `/usr/local/ns4mcp`;
  the `postinstall` script finds the logged-in (console) user and runs the patcher
  as them, so the config is written to *their* home, not root's. Signed + notarized
  only when the secrets below are present; otherwise an **unsigned** `.pkg` is
  produced (still installable via right-click → Open).
- **Windows** — Inno Setup `.exe`, **per-user** install to
  `%LOCALAPPDATA%\Programs\NS4MCP` (no admin). **Unsigned** by design — users click
  through SmartScreen ("More info" → "Run anyway"). Uninstalling removes the Claude
  config entry.
- **Linux** — `.tar.gz` containing the bundle + `install.sh`/`uninstall.sh`. Installs
  to `~/.local/share/ns4mcp` (override with `NS4_INSTALL_DIR`). (Official Claude
  Desktop is macOS/Windows; the Linux target is here for unofficial desktop builds.)

## macOS signing — required GitHub secrets

The macOS job auto-signs + notarizes **only if** these repo secrets are set.
Without them the pipeline still succeeds with an unsigned `.pkg`.

| Secret | What it is |
|---|---|
| `MACOS_CERT_P12` | base64 of a `.p12` containing **both** your *Developer ID Application* and *Developer ID Installer* certs (with private keys). |
| `MACOS_CERT_PASSWORD` | password for that `.p12`. |
| `APPLE_ID` | your Apple ID email (for notarization). |
| `APPLE_TEAM_ID` | your 10-char Apple Developer Team ID. |
| `APPLE_APP_PASSWORD` | an **app-specific password** (appleid.apple.com → Sign-In & Security) for `notarytool`. |

Export the `.p12` from **Keychain Access** (select both Developer ID certs → Export),
then:

```bash
base64 -i DeveloperID.p12 | pbcopy   # paste into the MACOS_CERT_P12 secret
```

Add them under **repo → Settings → Secrets and variables → Actions**. Notarization
also requires accepting the latest Apple Developer agreements.

> Windows signing is intentionally skipped (no paid cert). To add it later, drop a
> signing step into the `windows` job before the upload and sign both
> `runtime\node.exe` and the final `-setup.exe`.

### When Apple notarization is slow (backlog)

Apple's Notary Service occasionally backlogs: submissions sit at `In Progress` for
hours (sometimes the whole day) even though signing/auth are fine. A *bad* package
fails fast as `Invalid` with a log — a long `In Progress` is **Apple-side**, not us.

The macOS job waits up to 20 min, then — rather than failing — uploads the **signed
but un-stapled** `.pkg` with a warning and `NOTARIZED=false`. So during a backlog you
still get installers to test the install/config flow; they just trigger Gatekeeper
until stapled.

To finish them once Apple recovers (no CI re-run needed), staple locally:

```bash
# one-time: store an app-specific password
xcrun notarytool store-credentials ns4-notary \
  --apple-id gb@gabrielebulfon.com --team-id 62K8Y7Q23Q --password xxxx-xxxx-xxxx-xxxx

# download the .pkg from the workflow run, then:
installers/macos/notarize-staple.sh NS4MCP-<ver>-macos-arm64.pkg ns4-notary
```

Check a stuck submission without re-submitting:
`xcrun notarytool history --keychain-profile ns4-notary`.

**Before publishing a real release**, confirm the macOS jobs logged `NOTARIZED=true`
(or staple locally and re-upload), so users don't get a Gatekeeper warning.

## Cutting a release

```bash
# bump version in package.json, commit, then:
git tag v0.1.0
git push origin v0.1.0
```

The workflow builds all four artifacts (macOS arm64 + x64, Windows x64, Linux x64)
and attaches them to a GitHub Release named for the tag.
