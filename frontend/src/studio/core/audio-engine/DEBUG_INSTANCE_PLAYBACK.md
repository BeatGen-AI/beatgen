# Debug Guide: MIDI Instance Playback Issue

## Problem
When playing 2 MIDI track instances back to back, the second instance doesn't play audio.

## Potential Causes

1. **Instance Creation Issue**
   - Instances might not be properly created in the audio engine
   - Check console logs for: `Added instance ${instanceId} for track ${trackId}`

2. **Sequencer Scheduling**
   - The SequencerWrapper might not be scheduling notes correctly for the second instance
   - Check if the offset calculation is correct

3. **Channel Allocation**
   - MIDI channels might be conflicting between instances
   - Check if each instance gets a unique channel

4. **Note Trimming**
   - The second instance might have all its notes trimmed out
   - Check trim_start_ticks and trim_end_ticks values

## Debug Steps

1. **Check Instance Creation**
   ```javascript
   // In browser console, check if instances exist:
   const store = window.store || document.querySelector('[data-store]')?.__store;
   const soundfont = store.getSoundfontController();
   // Look for instance-related logs
   ```

2. **Verify Instance Offsets**
   - First instance should have x_position = 0 (or some value)
   - Second instance should have x_position = first_instance_end

3. **Check Sequencer Logs**
   - Look for: `Starting instance "${id}" for playback`
   - Look for: `Scheduling ${count} events from tick ${tick}`

4. **Monitor MIDI Events**
   - Use browser dev tools to monitor network/console for MIDI events
   - Check if note events are being sent for both instances

## Temporary Fix

If instances aren't working, you can test by manually creating them:

```javascript
// Get the track
const track = store.projectManager.getTrackById('your-track-id');

// Check instances
console.log('Track instances:', track.instances);

// If only one instance, add another
if (track.instances.length === 1) {
    const firstInstance = track.instances[0];
    const secondInstance = {
        id: `${track.id}_instance_1`,
        track_id: track.id,
        x_position: 1920, // 1 measure after first
        y_position: firstInstance.y_position,
        trim_start_ticks: 0,
        trim_end_ticks: undefined
    };
    
    // Add to track
    store.projectManager.updateTrack(track.id, {
        instances: [...track.instances, secondInstance]
    });
    
    // Reconnect to soundfont
    await store.connectTrackToSoundfont(track.id, track.instrument_id);
}
```

## Root Cause Analysis

The issue is likely in the scheduling logic. When the MidiSoundfontPlayerWithInstances plays, it calls:

```javascript
await instance.sequencer.play(this.masterTick);
```

But each instance should play from a different tick position based on its offset. The SequencerWrapper should handle this with its `globalToLocalTick` conversion, but there might be an issue with:

1. The master tick not being properly maintained during playback
2. The offset calculation being incorrect
3. The second instance's notes being scheduled in the past

## Solution

The fix would be to ensure that:
1. Each instance's sequencer properly converts global time to local time
2. The second instance's notes are scheduled relative to its offset
3. The transport maintains proper timing for all instances