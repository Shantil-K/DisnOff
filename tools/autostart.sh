#!/bin/sh
# Run at boot by Homebrew Channel (/var/lib/webosbrew/init.d).
# Re-applies the patch: Disney+ app updates replace the app folder, and the
# overlay mount for preinstalled Disney+ does not survive a reboot.
DIR="$(dirname "$(readlink -f "$0")")"
"$DIR/patchctl.sh" start >/dev/null 2>&1
exit 0
