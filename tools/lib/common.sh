#!/bin/sh
BASE="/tmp/disnoff"
LOG="$BASE/patcher.log"

mkdir -m 777 -p "$BASE"

log() {
  [ -f "$LOG" ] || : > "$LOG"
  echo "$(date +%H:%M:%S) $*" >> "$LOG"
}

die() {
  log "ERROR: $*"
  cat "$LOG"
  exit 1
}

APP_ID="com.disnoff.patcher"

# Candidate Disney+ package IDs on webOS
CANDIDATE_APP_IDS="com.disney.disneyplus-prod com.disney.disneyplus disneyplus"
TARGET_APP_ID=""
TARGET_DIR=""
TARGET_MODE=""

for candidate in $CANDIDATE_APP_IDS; do
  store_dir="/media/cryptofs/apps/usr/palm/applications/$candidate"
  system_dir="/usr/palm/applications/$candidate"
  if [ -d "$store_dir" ]; then
    TARGET_APP_ID="$candidate"
    TARGET_DIR="$store_dir"
    TARGET_MODE="store"
    break
  elif [ -d "$system_dir" ]; then
    TARGET_APP_ID="$candidate"
    TARGET_DIR="$system_dir"
    TARGET_MODE="system"
    break
  fi
done

# Default fallback if not yet installed
if [ -z "$TARGET_APP_ID" ]; then
  TARGET_APP_ID="com.disney.disneyplus-prod"
fi

PATCHER_BASE_DIR="/media/developer/apps/usr/palm/applications/$APP_ID"
PATCHER_RESOURCES_DIR="$PATCHER_BASE_DIR/resources/disneyplus"
TOOLS_DIR="$PATCHER_BASE_DIR/tools"
SCRIPTS_DIR="$TOOLS_DIR/lib"

TARGET_DIR_STORE="/media/cryptofs/apps/usr/palm/applications/$TARGET_APP_ID"
TARGET_DIR_SYSTEM="/usr/palm/applications/$TARGET_APP_ID"
OVERLAY_DIR="/media/developer/disnoff-overlay/$TARGET_APP_ID"

USERSCRIPT_SRC="$PATCHER_RESOURCES_DIR/webOSUserScripts/userScript.js"
USERSCRIPT_REL="webOSUserScripts/userScript.js"
HOSTS_SRC="$PATCHER_RESOURCES_DIR/config/hosts.block"
HOSTS_SYSTEM="/etc/hosts"
HOSTS_MARK_BEGIN="# >>> disnoff >>>"
HOSTS_MARK_END="# <<< disnoff <<<"

AUTOSTART_ENTRY="50-custom-disnoff"
AUTOSTART_SCRIPT="$TOOLS_DIR/autostart.sh"

require_root() {
  if [ "$(id -u 2>/dev/null)" != "0" ]; then
    die "not root (must be run via hbchannel exec)"
  fi
}

require_target() {
  [ -n "$TARGET_DIR" ] || die "Disney+ app not installed (looked for $CANDIDATE_APP_IDS in cryptofs and system)"
  # User scripts are only loaded by WebAppManager, i.e. for "type":"web" apps.
  grep -q '"type"[[:space:]]*:[[:space:]]*"web"' "$TARGET_DIR/appinfo.json" 2>/dev/null ||
    die "$TARGET_APP_ID is not a web app, user script would not load"
}

toast() {
  luna-send -n 1 -a "$APP_ID" luna://com.webos.notification/createToast \
    "{\"message\":\"$1\", \"iconUrl\":\"$PATCHER_BASE_DIR/disnoff.png\", \"sourceId\":\"$APP_ID\"}" >/dev/null 2>&1
}

close_target_app() {
  luna-send -n 1 luna://com.webos.applicationManager/closeByAppId \
    "{\"id\":\"$TARGET_APP_ID\"}" >/dev/null 2>&1 && log "Closed running $TARGET_APP_ID app"
  return 0
}
