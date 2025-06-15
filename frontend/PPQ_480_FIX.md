# PPQ 480 Fix for Track Resize

## Changes Made

### 1. Fixed Timeline.tsx Width Calculation
- Added import for MUSIC_CONSTANTS
- Changed from hardcoded 960 to proper tick-to-seconds conversion:
  ```typescript
  const durationInSeconds = (track.duration_ticks || 0) / MUSIC_CONSTANTS.pulsesPerQuarterNote / (bpm / 60);
  ```
- This correctly converts: ticks → beats → seconds

### 2. Updated All Comments
- noteConversion.ts: Changed "1/960th of a beat" to "480 ticks per beat"
- PianoRoll.tsx: Updated similar comments
- DrumMachine.tsx: Updated similar comments

### 3. Fixed TICKS_PER_STEP
- Changed from `PULSES_PER_QUARTER_NOTE` (480) to `PULSES_PER_QUARTER_NOTE / 4` (120)
- This correctly represents 16th notes (1/4 of a beat)

### 4. Added Detailed Logging
- Added PPQ logging in tracksSlice resize handler
- Added detailed resize calculations logging in BaseTrackPreview
- Added DOM sync logging to track state updates

## Why pixelsToTicks/ticksToPixels Don't Need BPM

The conversion functions are correct as-is because:
1. The visual grid is fixed - measures have constant pixel width regardless of tempo
2. BPM affects playback speed, not visual representation
3. Ticks represent musical position, not time
4. The formula is simply: pixels ↔ beats ↔ ticks

## Testing

With these changes:
1. Track widths should display correctly
2. Resize operations should not cause jumping
3. All calculations use consistent PPQ of 480
4. Console logs will show the exact calculations for debugging

## Remaining Issues to Watch

If resize still jumps, check the console logs for:
- Mismatch between visual width and calculated width
- Large deltas that indicate calculation errors
- Differences between start/end positions