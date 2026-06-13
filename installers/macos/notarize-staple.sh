#!/usr/bin/env bash
# Notarize + staple a signed .pkg locally — resilient to Apple's notary backlogs
# (it polls through transient network errors and a long "In Progress" queue).
#
# Prereq (once): store an app-specific password in your keychain:
#   xcrun notarytool store-credentials ns4-notary \
#     --apple-id you@example.com --team-id ABCDE12345 --password xxxx-xxxx-xxxx-xxxx
#
# Usage:
#   installers/macos/notarize-staple.sh <signed.pkg> [keychain-profile] [budget-minutes]
#   installers/macos/notarize-staple.sh NS4MCP-0.1.0-macos-arm64.pkg ns4-notary 120
#
# Use this to staple an artifact CI built but couldn't notarize during an Apple
# outage: download the .pkg from the workflow run, run this, re-upload.
set -euo pipefail

PKG="${1:?usage: notarize-staple.sh <signed.pkg> [keychain-profile] [budget-minutes]}"
PROFILE="${2:-ns4-notary}"
BUDGET_MIN="${3:-120}"
auth=(--keychain-profile "$PROFILE")

jqid() { /usr/bin/python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("'"$1"'",""))' 2>/dev/null || true; }

echo "Submitting $PKG (profile: $PROFILE, budget: ${BUDGET_MIN}m)…"
submit_json=$(xcrun notarytool submit "$PKG" "${auth[@]}" --output-format json)
echo "$submit_json"
sub_id=$(printf '%s' "$submit_json" | jqid id)
[ -n "$sub_id" ] || { echo "Could not get submission id"; exit 1; }
echo "Submission id: $sub_id"

polls=$(( BUDGET_MIN * 2 ))   # one poll / 30s
status=""
for i in $(seq 1 "$polls"); do
  info=$(xcrun notarytool info "$sub_id" "${auth[@]}" --output-format json 2>/dev/null || true)
  status=$(printf '%s' "$info" | jqid status)
  echo "  [poll $i/$polls] ${status:-<network blip, retrying>}"
  case "$status" in
    Accepted) break ;;
    Invalid|Rejected)
      echo "Notarization $status — Apple's log:"
      xcrun notarytool log "$sub_id" "${auth[@]}" || true
      exit 1 ;;
  esac
  sleep 30
done

if [ "$status" != "Accepted" ]; then
  echo "Still '${status:-In Progress}' after ${BUDGET_MIN}m — Apple's notary queue is slow."
  echo "Check later without re-submitting:  xcrun notarytool info $sub_id --keychain-profile $PROFILE"
  echo "When it flips to Accepted:           xcrun stapler staple \"$PKG\""
  exit 2
fi

for i in 1 2 3 4 5; do
  xcrun stapler staple "$PKG" && break || { echo "  staple attempt $i failed, retrying…"; sleep 15; }
done
xcrun stapler validate "$PKG"
echo "✅ Notarized + stapled: $PKG"
