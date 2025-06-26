# MIDI Instance Playback Fix

## Issue
When playing MIDI track instances back-to-back, the second instance doesn't play because its offset puts it in the future relative to the current transport position.

## Root Cause
The SequencerWrapper uses the instance's x_position as an offset. When you have:
- Instance 1: x_position = 0
- Instance 2: x_position = 1920 (1 measure later)

And the transport starts at position 0, the second instance's local tick calculation results in negative values, causing its notes not to be scheduled.

## Solution

### Option 1: Fix the SequencerWrapper's scheduling logic
Modify the `scheduleEvents` method to handle future instances properly:

```javascript
// In SequencerWrapper.scheduleEvents()
scheduleEvents(fromTick: number): void {
  if (this._isMuted) return;
  
  // If fromTick is negative (instance starts in the future), 
  // schedule all events with appropriate delay
  if (fromTick < 0) {
    const delayTicks = Math.abs(fromTick);
    for (const event of this.noteEvents) {
      const adjustedTick = event.tick + delayTicks;
      this.sendEventAt(event.event, adjustedTick);
    }
  } else {
    // Normal scheduling for current/past instances
    for (const event of this.noteEvents) {
      if (event.tick >= fromTick) {
        const relativeTick = event.tick - fromTick;
        this.sendEventAt(event.event, relativeTick);
      }
    }
  }
}
```

### Option 2: Implement Lookahead Scheduling
Add a lookahead mechanism to the MidiSoundfontPlayerWithInstances:

```javascript
// In MidiSoundfontPlayerWithInstances
private scheduleLookahead(): void {
  if (!this.isPlaying) return;
  
  const currentGlobalTick = this.masterTick;
  const lookaheadTicks = 5000; // 5 seconds lookahead
  
  this.instances.forEach((instance, id) => {
    const instanceStartTick = instance.x_position;
    
    // Check if instance should start playing soon
    if (instanceStartTick >= currentGlobalTick && 
        instanceStartTick < currentGlobalTick + lookaheadTicks) {
      // Schedule this instance to start at the right time
      const delayMs = (instanceStartTick - currentGlobalTick);
      setTimeout(() => {
        instance.sequencer.play(instanceStartTick);
      }, delayMs);
    }
  });
}
```

### Option 3: Pre-calculate Instance Scheduling
When play() is called, calculate which instances should be playing:

```javascript
async play(): Promise<void> {
  if (this.isPlaying) return;
  
  console.log(`Starting playback from tick ${this.masterTick}`);
  
  // Group instances by their start time
  const instancesByStartTime = new Map();
  
  this.instances.forEach((instance, id) => {
    const startTime = instance.x_position;
    if (!instancesByStartTime.has(startTime)) {
      instancesByStartTime.set(startTime, []);
    }
    instancesByStartTime.get(startTime).push(instance);
  });
  
  // Start instances that should be playing now
  const currentTick = this.masterTick;
  for (const [startTime, instances] of instancesByStartTime) {
    if (startTime <= currentTick) {
      // These instances should be playing
      for (const instance of instances) {
        await instance.sequencer.play(currentTick);
      }
    }
  }
  
  this.isPlaying = true;
  
  // Start a process to monitor future instances
  this.startInstanceMonitor();
}
```

## Recommended Fix
The best approach is Option 1 - fixing the SequencerWrapper's scheduling logic to properly handle negative local ticks. This maintains the current architecture while ensuring all instances play correctly regardless of their position on the timeline.

## Testing
After implementing the fix, test with:
1. Two instances back-to-back (x_position: 0 and 1920)
2. Three instances with gaps (x_position: 0, 3840, 7680)
3. Overlapping instances (x_position: 0 and 960)
4. Starting playback from middle of timeline