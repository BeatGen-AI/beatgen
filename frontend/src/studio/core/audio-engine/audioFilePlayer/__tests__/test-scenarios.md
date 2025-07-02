# AudioFilePlayer Test Scenarios

## Overview
This document outlines comprehensive test scenarios for the AudioFilePlayer component, covering all major features and their interactions.

## 1. Track Position and Trim Functionality

### Track Position
- **Basic Position Setting**: Verify that `setTrackPosition(id, x, y)` correctly sets the track's position
- **Non-existent Track**: Ensure setting position on non-existent track doesn't throw errors
- **Position Persistence**: Verify position is maintained through other track operations

### Track Trim
- **Basic Trim Setting**: Test `setTrackTrim(trackId, trimStartTicks, trimEndTicks)`
- **Tick to Second Conversion**: Verify correct conversion based on BPM and PPQ settings
- **Buffer Duration Clamping**: Ensure trim values are clamped to actual audio buffer duration
- **Player Loop Points**: Verify that trim settings update the Tone.Player's loopStart/loopEnd
- **Trim Settings Storage**: Check that `_trimSettings` are stored on the player for playback scheduling
- **Tracks Without Players**: Handle trim operations on tracks without audio files gracefully

### Track Updates
- **Update with Trim**: Test that `updateTrack()` applies trim settings when present
- **Preserve Player/Channel**: Ensure player and channel instances are preserved during updates
- **Property Updates**: Verify all track properties can be updated while maintaining audio connections

## 2. Solo Functionality

### Basic Solo Operations
- **Single Track Solo**: When soloing one track, all other non-soloed tracks should be muted
- **Multiple Track Solo**: Multiple tracks can be soloed simultaneously
- **Un-solo Behavior**: When un-soloing, volumes should be restored for non-muted tracks

### Solo State Interactions
- **Solo with Existing Solo**: Adding a solo track shouldn't affect already soloed tracks
- **Solo and Mute Interaction**: Explicitly muted tracks should remain muted when solo is removed
- **Muting Soloed Track**: A track can be both soloed and muted
- **Complex Solo Chains**: Handle rapid solo/unsolo operations correctly

### Volume Management During Solo
- **Temporary Muting**: Non-soloed tracks get volume set to -Infinity (temporary mute)
- **Volume Restoration**: Original volumes are restored when solo state changes
- **Muted Track Handling**: Already muted tracks stay muted regardless of solo state

## 3. Playback Control Methods

### Stop All Playback
- **Active Players**: Stop all players that are in "started" state
- **Stopped Players**: Don't call stop on already stopped players
- **No Players**: Handle tracks without players gracefully
- **State Cleanup**: Ensure proper state after stopping

### Pause All Playback
- **Maintain Position**: Pause should maintain playback position
- **No Stop Calls**: Players shouldn't be stopped during pause
- **Transport Sync**: Players remain synced with paused transport
- **State Logging**: Proper logging of pause state

## 4. Master Volume Control

### Volume Setting
- **Basic Operation**: `setMasterVolume(volume)` sets main output volume
- **Value Range**: Accept positive and negative dB values
- **Zero Handling**: Handle 0 dB (unity gain) correctly

## 5. Resource Cleanup (removeTrack)

### Player Cleanup
- **Stop Playing**: Stop player if it's currently playing
- **Dispose Player**: Call dispose() to free resources
- **Unsync Player**: Ensure player is unsynced from transport

### Channel Cleanup
- **Dispose Channel**: Channel must be disposed
- **Disconnect Audio**: Ensure audio connections are severed

### State Cleanup
- **Map Removal**: Track removed from internal tracks map
- **Graceful Handling**: Handle non-existent track removal
- **No Player Tracks**: Clean up tracks without players

## 6. Integration Scenarios

### Solo and Mute Together
- **Muted then Soloed**: Muted tracks stay muted when other tracks are soloed
- **Soloed then Muted**: Soloing doesn't prevent muting
- **Complex States**: Multiple tracks with different solo/mute combinations

### Volume with Solo/Mute
- **Volume Persistence**: Volume settings persist through solo/mute changes
- **Muted Volume Changes**: Can change volume while muted
- **Solo Volume Independence**: Soloed tracks maintain independent volumes

### Trim and Position
- **Combined Settings**: Tracks can have both position and trim
- **Update Propagation**: Updates apply both position and trim correctly

### Multi-Track Operations
- **Many Tracks**: Handle 50+ tracks efficiently
- **Rapid Changes**: Handle rapid state changes without errors
- **Different Settings**: Tracks with varied volumes, pans, positions, and trims

## 7. Edge Cases

### Invalid Operations
- **Non-existent Tracks**: All operations handle missing tracks gracefully
- **No Errors**: Operations on non-existent tracks don't throw

### Extreme Values
- **Volume Extremes**: Handle volumes below 0 and above 100
- **Pan Extremes**: Handle pan values outside -100 to 100 range
- **Trim Beyond Duration**: Trim values exceeding audio duration are clamped

### Resource Stress
- **Many Tracks**: Create and remove many tracks
- **Active Playback Removal**: Remove tracks during playback
- **Rapid Operations**: Handle rapid sequential operations

## 8. State Consistency

### Internal State
- **Track Properties**: All properties correctly stored and retrieved
- **Map Consistency**: Internal tracks map stays consistent
- **Player State**: Player state matches track state

### Audio Graph
- **Connections**: Audio connections maintained correctly
- **Volume Application**: Volume changes apply to both channel and player
- **Signal Flow**: Main output receives all track outputs

## Test Implementation

The test scenarios are implemented in two test files:

1. **audioEngine.test.ts**: Unit tests covering individual features
2. **audioEngine.integration.test.ts**: Integration tests covering feature interactions

Each test includes:
- Setup of necessary mocks
- Clear scenario description
- Assertions on expected behavior
- Cleanup verification where applicable

## Coverage Goals

- 100% of public methods tested
- All error paths covered
- Edge cases explicitly tested
- Integration between features verified
- Resource cleanup confirmed
- State consistency maintained