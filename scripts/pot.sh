#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

scripts/build.sh >/dev/null
mkdir -p po
xgettext --from-code=UTF-8 --language=JavaScript --keyword=_ --keyword=N_ \
    --package-name=herdr-pip --msgid-bugs-address=https://github.com/hungify/herdr-pip/issues \
    --add-location=file --sort-by-file --output=po/herdr-pip.pot "build/$UUID"/*.js
for po in po/*.po; do
    [ -e "$po" ] && msgmerge --update --backup=none "$po" po/herdr-pip.pot
done
echo "wrote po/herdr-pip.pot"
