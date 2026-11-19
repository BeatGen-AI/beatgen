#!/bin/bash
# Vendor js-synthesizer's browser files into public/js-synthesizer.
#
# The AudioWorklet scripts are loaded by URL (audioContextManager.ts, MidiTrackRenderer.ts,
# index.html), so they are copied out of node_modules and committed. They MUST match the
# installed npm `js-synthesizer` version: the main-thread library and the worklet agree on a
# processor name that changes between releases. Re-run this after upgrading js-synthesizer.
#
# Usage (from frontend/, after `npm ci`): ./setup-js-synthesizer.sh
set -euo pipefail

FLUIDSYNTH_VERSION="2.4.6"  # keep in sync with the libfluidsynth-*.js URLs in src/ and index.html
SRC="node_modules/js-synthesizer"
DEST="public/js-synthesizer"

if [ ! -d "$SRC" ]; then
  echo "error: $SRC not found; run npm ci first" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
for file in js-synthesizer.js js-synthesizer.js.map js-synthesizer.min.js js-synthesizer.min.js.map \
            js-synthesizer.worklet.js js-synthesizer.worklet.js.map \
            js-synthesizer.worklet.min.js js-synthesizer.worklet.min.js.map; do
  cp "$SRC/dist/$file" "$DEST/"
done
cp "$SRC/externals/libfluidsynth-$FLUIDSYNTH_VERSION.js" "$DEST/"
cp "$SRC/externals/LICENSE.fluidsynth.txt" "$DEST/"

echo "Vendored js-synthesizer $(node -p "require('./$SRC/package.json').version") with libfluidsynth $FLUIDSYNTH_VERSION into $DEST"
