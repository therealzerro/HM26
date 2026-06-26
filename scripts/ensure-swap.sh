#!/usr/bin/env bash
# ensure-swap.sh — guarantee swap exists before Metro bundles.
#
# Why: this codespace has 2 cores / ~8GB RAM and ships with 0 swap. The VS Code
# server + extension hosts consume ~6GB, leaving Metro ~2GB. Bundling this app
# (~3400 modules) spikes past that at the serialize step, so the kernel SIGKILLs
# Metro at ~80% — the app "won't load from npm run start". A swapfile absorbs the
# transient peak so the bundle completes.
#
# Idempotent: no-op if any swap is already active. Non-fatal: if swap can't be
# created (e.g. / is overlayfs), it warns and lets start proceed anyway.
# Note: / is overlayfs (no swap), but /tmp is real ext4 here — swap goes there.

if [ "$(swapon --show --noheadings 2>/dev/null | wc -l)" -gt 0 ]; then
  exit 0
fi

SWAP=/tmp/swapfile
{
  sudo dd if=/dev/zero of="$SWAP" bs=1M count=4096 status=none &&
  sudo chmod 600 "$SWAP" &&
  sudo mkswap "$SWAP" >/dev/null &&
  sudo swapon "$SWAP" &&
  echo "[ensure-swap] enabled 4G swap at $SWAP"
} || echo "[ensure-swap] WARN: could not enable swap (continuing). If Metro OOMs, free IDE memory or restart the codespace."

exit 0
