#!/bin/sh
# Point git at the version-controlled hooks dir (idempotent, never fails).
if [ -d .git ]; then
  git config core.hooksPath scripts/hooks
fi
exit 0
