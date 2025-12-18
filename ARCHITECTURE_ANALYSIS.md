# BeatGen Architecture Analysis: Soundtrap Comparison

## Executive Summary

BeatGen's codebase is **~70% aligned** with the Soundtrap-style DAW architecture. The foundation is solid, but there are structural deviations that will require refactoring for full alignment—particularly around state management, the controller layer, and collaboration readiness.

---

## Table of Contents

1. [Target Architecture (Soundtrap Model)](#target-architecture-soundtrap-model)
2. [What Matches the Architecture](#what-matches-the-architecture)
3. [What Deviates from the Architecture](#what-deviates-from-the-architecture)
4. [Gap Analysis Summary](#gap-analysis-summary)
5. [Migration Path](#migration-path)
6. [File Reference](#file-reference)

---

## Target Architecture (Soundtrap Model)

### Layered Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer                                  │
│  React components, Canvas renderers, DOM manipulation            │
│  ONLY knows how to render state and capture user intent          │
└─────────────────────────┬───────────────────────────────────────┘
                          │ calls down (never up)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer                             │
│  Commands, Controllers, Use Cases                                │
│  Orchestrates everything, owns the "what happens when"           │
└───────────┬─────────────────────────────────────────┬───────────┘
            │                                         │
            ▼                                         ▼
┌───────────────────────┐           ┌─────────────────────────────┐
│     Domain Layer      │           │      Infrastructure         │
│  Project model        │           │  Audio Engine               │
│  Clips, Tracks        │           │  Collab Transport           │
│  Pure data + logic    │           │  File Storage               │
│  NO side effects      │           │  IndexedDB Cache            │
└───────────────────────┘           └─────────────────────────────┘
```

**Critical Rule:** Dependencies point downward only.
- Domain layer has zero knowledge of React, audio APIs, or network
- UI has zero knowledge of Web Audio
- Application layer is the only thing that touches everything

### Key Architectural Patterns

#### 1. Central Controller/Orchestrator

```typescript
class ProjectController {
  constructor(
    private store: ProjectStore,
    private audioEngine: IAudioEngine,
    private undoManager: UndoManager,
    private collabClient: CollabClient | null,
    private autosave: AutosaveManager,
  ) {}

  // Single entry point for ALL mutations
  execute(command: Command) {
    // 1. Capture state for undo BEFORE mutation
    const undoCommand = this.createInverse(command)

    // 2. Apply to project state
    const patch = this.applyCommand(command)

    // 3. Explicit side effects, in order
    this.audioEngine.applyPatch(patch)
    this.undoManager.push(undoCommand)
    this.autosave.markDirty()

    // 4. Collab sync (if connected)
    if (this.collabClient?.connected) {
      this.collabClient.sendOperation(command)
    }

    return patch
  }
}
```

#### 2. Patch-Based State Updates

```typescript
interface Patch {
  path: string[]      // ['tracks', 'abc123', 'volume']
  prev: unknown
  next: unknown
}

// Everything works with patches
store.updateTrack() → returns Patch
audioEngine.applyPatch(patch)
collabClient.sendPatch(patch)
```

#### 3. Pure Viewport/Coordinate System

```typescript
class Viewport {
  timeToPixel(beats: number): number
  pixelToTime(px: number): number
  trackIndexToPixel(index: number): number
  getVisibleTimeRange(): [number, number]
  getVisibleTrackRange(): [number, number]
}
```

#### 4. Interaction State Machines

```typescript
class MoveClipInteraction implements Interaction {
  update(point: Point) { /* preview state */ }
  commit(controller: ProjectController) { /* final action */ }
}
```

#### 5. Container/Presentational Split

```typescript
// Pure presentational
function TrackHeader({ track, onVolumeChange }: Props) {
  return <Fader value={track.volume} onChange={onVolumeChange} />
}

// Container connects to state
function TrackHeaderContainer({ trackId }) {
  const track = useProjectStore(s => s.tracks[trackId])
  const controller = useController()
  return <TrackHeader track={track} onVolumeChange={...} />
}
```

---

## What Matches the Architecture

### 1. Command Pattern (Undo/Redo) ✅

**Location:** `frontend/src/studio/core/state/history/actions/`

Your implementation closely matches the ideal:

```
BaseAction → TrackAction, NoteAction, ProjectActions
     ↓
HistoryManager (undoStack, redoStack)
     ↓
execute() / undo() with inverse command creation
```

**What's Good:**
- Commands are objects with `execute()` and `undo()` methods
- Single `HistoryManager` singleton manages stacks
- Observer pattern for UI notifications via `subscribe()`
- Actions capture old state for undo

**Key Files:**
- `frontend/src/studio/core/state/history/HistoryManager.ts`
- `frontend/src/studio/core/state/history/actions/BaseAction.ts`
- `frontend/src/studio/core/state/history/actions/TrackActions.ts`
- `frontend/src/studio/core/state/history/actions/NoteActions.ts`
- `frontend/src/studio/core/state/history/actions/ProjectActions.ts`

---

### 2. Audio Engine Decoupling ✅

**Location:** `frontend/src/studio/core/audio-engine/`

This is **well-architected**:

```typescript
// Engine receives state, not commands
engine.setState(playbackState)

// Clean interface - no Web Audio leakage
interface AudioEngine {
  initialize(): Promise<void>
  dispose(): void
  play(): void
  pause(): void
  stop(): void
  seek(ticks: number): void
  setState(state: PlaybackState): void

  // Resource management
  loadAudioBuffer(id: string, source: File | ArrayBuffer): Promise<number>
  loadSoundfont(id: string, data: ArrayBuffer): Promise<number>

  // Event subscriptions
  onTimeUpdate(callback): Unsubscribe
  onStateChange(callback): Unsubscribe
  onError(callback): Unsubscribe
}
```

**What's Good:**
- Singleton pattern via `getAudioEngine()`
- Declarative state-based API (receives `PlaybackState`, not imperative calls)
- Pure transformation function: `buildPlaybackState()`
- Renderer abstraction per track type (Audio, MIDI, Sampler)
- Event-driven updates back to UI
- Zero Web Audio API leakage to consumers

**Key Files:**
- `frontend/src/studio/core/audio-engine/AudioEngine.ts`
- `frontend/src/studio/core/audio-engine/types.ts`
- `frontend/src/studio/core/playback/buildPlaybackState.ts`

---

### 3. Renderer Separation (Audio Engine) ✅

**Location:** `frontend/src/studio/core/audio-engine/renderers/`

```
ITrackRenderer interface
├── AudioTrackRenderer  (Tone.Player for audio files)
├── MidiTrackRenderer   (js-synthesizer for MIDI)
└── SamplerTrackRenderer (Tone.GrainPlayer for samplers)
```

Each renderer:
- Implements same contract (`update`, `play`, `pause`, `seek`, `cleanup`, `dispose`)
- Handles its own audio graph construction
- Receives diffed state for incremental updates
- Manages track-specific resources (channels, players)

**Key Files:**
- `frontend/src/studio/core/audio-engine/renderers/BaseRenderer.ts`
- `frontend/src/studio/core/audio-engine/renderers/AudioTrackRenderer.ts`
- `frontend/src/studio/core/audio-engine/renderers/MidiTrackRenderer.ts`
- `frontend/src/studio/core/audio-engine/renderers/SamplerTrackRenderer.ts`

---

### 4. Canvas-Based Timeline with Viewport Culling ✅

**Location:** `frontend/src/studio/components/timeline/`

Uses Konva.js (canvas library) with:
- Viewport/coordinate system (`pixelsPerTick`, scroll offsets)
- Viewport culling for performance (only render visible items)
- Separate render layers: Grid, Tracks, TimeRuler, PlaybackCursor

```typescript
// Viewport culling example
const visibleKonvaItems = useMemo(() => {
  const buffer = 200;
  const viewportLeft = viewport.x - buffer;
  const viewportRight = viewport.x + stageSize.width + buffer;

  return konvaItems.filter(item => {
    const itemLeft = item.x * pixelsPerTick;
    const itemRight = itemLeft + (item.width * pixelsPerTick);
    return !(itemRight < viewportLeft || itemLeft > viewportRight);
  });
}, [konvaItems, viewport, stageSize, pixelsPerTick]);
```

**Key Files:**
- `frontend/src/studio/components/timeline/KonvaTimeline.tsx`
- `frontend/src/studio/components/timeline/konva/KonvaTrack.tsx`
- `frontend/src/studio/components/timeline/konva/TimeRuler.tsx`
- `frontend/src/studio/components/timeline/konva/PlaybackCursor.tsx`
- `frontend/src/studio/components/shared/konva/GridLayer.tsx`

---

### 5. Zustand Store with Immer ✅

**Location:** `frontend/src/studio/stores/`

Slice-based modular design:

```
studioStore
├── CoreSlice       (initialization, core settings)
├── ProjectSlice    (BPM, time signature, key)
├── TracksSlice     (track CRUD, dirty tracking)
├── HistorySlice    (undo/redo integration)
├── UISlice         (selected tools, zoom, panels)
├── MidiSlice       (MIDI operations)
├── SamplerSlice    (sampler track operations)
├── DrumSlice       (drum sequencer operations)
├── ToolSlice       (tool selection)
└── AudioEngineSlice (playback state, engine integration)
```

**What's Good:**
- Immer middleware for immutable updates with mutation syntax
- Slice composition keeps code organized
- Selectors prevent unnecessary re-renders

**Key Files:**
- `frontend/src/studio/stores/studioStore.ts`
- `frontend/src/studio/stores/slices/tracksSlice.ts`
- `frontend/src/studio/stores/slices/audioEngineSlice.ts`
- `frontend/src/studio/stores/slices/historySlice.ts`

---

### 6. Auto-Save with Dirty Tracking ✅

**Location:** `frontend/src/studio/core/auto-save/`

```typescript
DEFAULT_AUTO_SAVE_CONFIG = {
  enabled: true,
  debounceMs: 1000,        // Wait 1s after last change
  maxIntervalMs: 30000,    // Force save every 30s if dirty
  retryAttempts: 3,        // Exponential backoff retries
  retryDelayMs: 1000
}
```

**What's Good:**
- Debounced saves on dirty flag changes
- Force interval as backup
- Exponential backoff retries
- Error classification (network, conflict, auth)
- Marks tracks clean after successful save

**Key Files:**
- `frontend/src/studio/core/auto-save/AutoSaveService.ts`
- `frontend/src/studio/hooks/useAutoSave.ts`

---

### 7. Track Type Configuration Pattern ✅

**Location:** `frontend/src/studio/stores/config.ts`

```typescript
TRACK_CONFIG = {
  AUDIO: {
    initEngine: async (store, trackId, get, options) => {
      await engine.loadAudioBuffer(trackId, options.audioFile);
    }
  },
  MIDI: {
    initEngine: async (store, trackId, get, options) => {
      await store.connectTrackToSoundfont(trackId, options.instrumentId);
    }
  },
  SAMPLER: { ... },
  DRUM: { ... }
}
```

Factory pattern for type-specific initialization.

---

## What Deviates from the Architecture

### 1. Missing Controller/Orchestrator Layer 🔴 CRITICAL

**The Soundtrap Model:**
```typescript
class ProjectController {
  execute(command: Command) {
    const undoCommand = this.createInverse(command)
    const patch = this.applyCommand(command)

    // ALL side effects in one place:
    this.audioEngine.applyPatch(patch)
    this.undoManager.push(undoCommand)
    this.autosave.markDirty()
    this.collabClient?.send(command)
  }
}
```

**Current BeatGen Model:**
```typescript
// Side effects scattered across slices and actions

// TrackActions.ts
async execute() {
  _updateState('tracks', [...])  // Direct state mutation
  typeConfig.initEngine()        // Side effect inline
  store.markTrackAsDirty()       // Another side effect
}

// audioEngineSlice.ts (separate)
useEffect(() => {
  engine.setState(buildPlaybackState(...))
}, [tracks, bpm])  // Reactive, not explicit
```

**Problems:**
- Side effects are scattered across multiple files
- No single point to trace all mutations
- Adding collaboration means touching every action class, multiple slices, and hooks
- Harder to debug and reason about

**Impact:** Adding real-time collaboration requires refactoring every mutation point.

---

### 2. Dual State Systems 🔴 CRITICAL

You have **two overlapping state systems**:

**System 1 - Zustand Store:**
```typescript
// studioStore.ts
const useStudioStore = create<StudioState>()(...slices)
// Tracks, BPM, UI state live here
```

**System 2 - Store Singleton (Legacy):**
```typescript
// store.ts
export class Store {
  projectManager: ProjectManager
  midiManager: MidiManager        // MIDI notes live HERE
  instrumentManager: InstrumentManager
  sampleManager: SampleManager
}
```

**Problems:**
- Components access state inconsistently
- MIDI notes are NOT in Zustand - they live in `MidiManager`
- Special handling required for saves and undo
- Two sources of truth creates confusion

```typescript
// Some components use Zustand
const tracks = useStudioStore(s => s.tracks)

// Some access singleton managers
const midiManager = state.store.getMidiManager()
const notes = midiManager.getNotesForTrack(trackId)
```

**Impact:** Cannot undo MIDI note changes through the same system as track changes. State synchronization is fragile.

---

### 3. Reactive Audio Updates vs Explicit Dispatch 🟡 MEDIUM

**Soundtrap Model:**
```typescript
// Controller explicitly calls engine
execute(command) {
  const patch = this.applyCommand(command)
  this.audioEngine.applyPatch(patch)  // Explicit
}
```

**BeatGen Model:**
```typescript
// Reactive subscription (audioEngineSlice)
useEffect(() => {
  const playbackState = buildPlaybackState({
    tracks: state.tracks,
    midiManager: state.store.getMidiManager(),
    ...
  })
  engine.setState(playbackState)
}, [tracks, bpm, timeSignature])
```

**Problems:**
- No control over when engine updates happen
- Can't batch multiple changes
- Harder to debug (no clear "engine updated here" point)
- Performance: rebuilds entire state on any track change

---

### 4. Interactions Are Not State Machines 🟡 MEDIUM

**Soundtrap Model:**
```typescript
class MoveClipInteraction implements Interaction {
  private startPosition: number
  private currentOffset: number = 0

  constructor(private clip: Clip, private startPoint: Point) {
    this.startPosition = clip.startTime
  }

  update(point: Point) {
    this.currentOffset = point.time - this.startPoint.time
    // Update preview
  }

  commit(controller: ProjectController) {
    controller.execute({
      type: 'MOVE_CLIP',
      clipId: this.clip.id,
      newStartTime: this.startPosition + this.currentOffset
    })
  }
}
```

**BeatGen Model:**
```typescript
// useKonvaInteractions.ts - inline event handlers with refs
const handleMouseDown = () => {
  if (hitItem) {
    setIsDragging(true)
    dragStartRef.current = { ... }
  }
}

const handleMouseUp = () => {
  onDragEnd?.(finalPositions)
  setIsDragging(false)
}
```

**Problems:**
- Complex interactions are harder to reason about
- Can't easily add constraints or validation
- State spread across multiple `useState` and `useRef`
- Hard to test in isolation

---

### 5. No Patch-Based Updates 🟡 MEDIUM

**Soundtrap Model:**
```typescript
interface Patch {
  path: ['tracks', 'abc123', 'volume']
  prev: 0.8
  next: 0.5
}

// Everything works with patches
store.updateTrack() → returns Patch
audioEngine.applyPatch(patch)
collabClient.sendPatch(patch)
```

**BeatGen Model:**
```typescript
// Direct state updates with full objects
_updateState('tracks', newTracksArray)
```

**Problems:**
- No fine-grained change tracking
- Collaboration requires knowing WHAT changed
- Audio engine receives full state, not diffs
- More data transfer than necessary

---

### 6. Commands Don't Return Patches 🟡 MEDIUM

**Soundtrap Model:**
```typescript
execute(command) {
  const patch = this.applyCommand(command)
  // patch tells everyone exactly what changed
  return patch
}
```

**BeatGen Model:**
```typescript
async execute() {
  // Mutates state directly, no return value
  _updateState('tracks', [...])
}
```

**Problems:**
- Side effects can't know what specifically changed
- Must diff entire state to detect changes
- Less efficient audio engine updates

---

### 7. No Centralized Viewport Class 🟡 MINOR

**Soundtrap Model:**
```typescript
class Viewport {
  timeToPixel(beats: number): number
  pixelToTime(px: number): number
  trackIndexToPixel(index: number): number
  getVisibleTimeRange(): [number, number]
  getVisibleTrackRange(): [number, number]
}
```

**BeatGen Model:**
- Calculations scattered across components
- `pixelsPerTick` passed as prop
- No centralized coordinate math class

**Problems:**
- Duplicate coordinate conversion logic
- Harder to maintain consistency
- Can't easily share viewport state

---

### 8. UI Components Coupled to Store Shape 🟡 MINOR

**Soundtrap Model:**
```typescript
// Pure presentational component
function TrackHeader({ track, onVolumeChange }) {
  return <Fader value={track.volume} onChange={onVolumeChange} />
}

// Container handles store connection
function TrackHeaderContainer({ trackId }) {
  const track = useProjectStore(s => s.tracks[trackId])
  const controller = useController()
  return <TrackHeader track={track} onVolumeChange={...} />
}
```

**BeatGen Model:**
```typescript
// Track.tsx mixes both responsibilities
function Track({ id }) {
  const tracks = useStudioStore(state => state.tracks)
  const fullTrack = useMemo(() => tracks.find(...), [tracks, id])
  // Logic and rendering mixed together
}
```

**Problems:**
- Harder to test components in isolation
- Components know too much about store structure
- Refactoring store requires touching many components

---

## Gap Analysis Summary

| Component | Soundtrap | BeatGen Current | Gap Level |
|-----------|-----------|-----------------|-----------|
| **Controller Layer** | Central orchestrator | Scattered in slices/actions | 🔴 Major |
| **State System** | Single ProjectStore | Zustand + Store singleton | 🔴 Major |
| **MIDI Note Storage** | In main store | Separate MidiManager | 🔴 Major |
| **Audio Engine Interface** | Clean + explicit calls | Clean + reactive sync | 🟡 Medium |
| **Command Pattern** | Commands return patches | Commands mutate directly | 🟡 Medium |
| **Undo System** | Command stack | Command stack | ✅ Good |
| **Audio Renderers** | Per-type with interface | Per-type with interface | ✅ Good |
| **Timeline Canvas** | Viewport class + renderers | Konva with viewport culling | ✅ Good |
| **Interactions** | State machines | Inline handlers with refs | 🟡 Medium |
| **Patch System** | Fine-grained patches | Full state updates | 🟡 Medium |
| **Collab Support** | Built into architecture | Not designed for it | 🔴 Major |
| **Viewport Abstraction** | Centralized class | Scattered calculations | 🟡 Minor |
| **Container/Presentational** | Strict separation | Mixed in components | 🟡 Minor |
| **Auto-Save** | Via controller | Direct dirty tracking | ✅ Good |

---

## Migration Path

### Phase 1: Unify State (Foundation) - HIGH PRIORITY

**Goal:** Single source of truth for all project data.

**Tasks:**
1. Move MIDI notes from `MidiManager` into Zustand store
   - Add `notes` field to track entities
   - Migrate `MidiManager` methods to slice actions

2. Eliminate `Store` singleton
   - Fold `ProjectManager` into `ProjectSlice`
   - Fold `InstrumentManager` into relevant slice
   - Fold `SampleManager` into relevant slice

3. Remove dual access patterns
   - All state access through Zustand selectors
   - No more `state.store.getMidiManager()`

**Files to Modify:**
- `frontend/src/studio/core/state/store.ts` → deprecate
- `frontend/src/studio/core/state/project.ts` → merge into slice
- `frontend/src/studio/stores/slices/midiSlice.ts` → expand
- All components using `Store` singleton

---

### Phase 2: Add Controller Layer - HIGH PRIORITY

**Goal:** Single entry point for all mutations with centralized side effects.

**Tasks:**
1. Create `ProjectController` class
   ```typescript
   class ProjectController {
     constructor(
       private store: StudioStore,
       private audioEngine: AudioEngine,
       private historyManager: HistoryManager,
       private autoSaveService: AutoSaveService
     ) {}

     execute(command: Command): Patch { ... }
   }
   ```

2. Route ALL mutations through `controller.execute(command)`
   - Track operations
   - Note operations
   - Project settings

3. Centralize side effects
   - Audio sync happens in controller
   - Undo push happens in controller
   - Dirty marking happens in controller

**Files to Create:**
- `frontend/src/studio/core/controller/ProjectController.ts`
- `frontend/src/studio/core/controller/types.ts`

**Files to Modify:**
- All action classes → return patches instead of mutating
- `frontend/src/studio/stores/slices/*.ts` → call controller

---

### Phase 3: Patch System - MEDIUM PRIORITY

**Goal:** Fine-grained change tracking for efficient updates and collaboration.

**Tasks:**
1. Define `Patch` interface
   ```typescript
   interface Patch {
     path: string[]
     prev: unknown
     next: unknown
     timestamp: number
   }
   ```

2. Commands return patches
   ```typescript
   execute(command): Patch {
     const prev = this.getState(command.path)
     this.applyCommand(command)
     const next = this.getState(command.path)
     return { path: command.path, prev, next }
   }
   ```

3. Audio engine receives patches
   - `engine.applyPatch(patch)` instead of `engine.setState(fullState)`
   - Incremental updates for better performance

**Files to Create:**
- `frontend/src/studio/core/patches/types.ts`
- `frontend/src/studio/core/patches/utils.ts`

---

### Phase 4: Interaction State Machines - MEDIUM PRIORITY

**Goal:** Clean, testable interaction handling.

**Tasks:**
1. Create interaction interface
   ```typescript
   interface Interaction {
     update(point: Point): void
     commit(controller: ProjectController): void
     cancel(): void
   }
   ```

2. Extract state machines
   - `MoveInteraction`
   - `ResizeInteraction`
   - `MarqueeSelectInteraction`
   - `DrawClipInteraction`

3. Refactor `useKonvaInteractions` to use state machines

**Files to Create:**
- `frontend/src/studio/core/interactions/Interaction.ts`
- `frontend/src/studio/core/interactions/MoveInteraction.ts`
- `frontend/src/studio/core/interactions/ResizeInteraction.ts`

---

### Phase 5: Viewport Abstraction - LOW PRIORITY

**Goal:** Centralized coordinate system.

**Tasks:**
1. Create `Viewport` class
   ```typescript
   class Viewport {
     constructor(
       public scrollX: number,
       public scrollY: number,
       public zoom: number,
       public trackHeight: number
     ) {}

     timeToPixel(ticks: number): number
     pixelToTime(px: number): number
     getVisibleTimeRange(): [number, number]
   }
   ```

2. Replace scattered calculations with Viewport methods

3. Store viewport in Zustand for reactivity

---

### Phase 6: Collaboration Ready - FUTURE

**Goal:** Architecture supports real-time collaboration.

**Prerequisites:** Phases 1-3 complete.

**Tasks:**
1. Patches enable operational transform
2. Controller broadcasts to collab layer
3. Remote operations apply via same command flow
4. Conflict resolution via OT or CRDT

---

## File Reference

### Core State

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/studio/stores/studioStore.ts` | Main Zustand store | ✅ Keep |
| `frontend/src/studio/stores/slices/*.ts` | State slices | ✅ Expand |
| `frontend/src/studio/core/state/store.ts` | Legacy Store singleton | ⚠️ Deprecate |
| `frontend/src/studio/core/state/project.ts` | Project manager | ⚠️ Merge |

### Audio Engine

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/studio/core/audio-engine/AudioEngine.ts` | Main engine | ✅ Good |
| `frontend/src/studio/core/audio-engine/types.ts` | Engine types | ✅ Good |
| `frontend/src/studio/core/audio-engine/renderers/*.ts` | Track renderers | ✅ Good |
| `frontend/src/studio/core/playback/buildPlaybackState.ts` | State transform | ✅ Good |

### History/Undo

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/studio/core/state/history/HistoryManager.ts` | Undo manager | ✅ Good |
| `frontend/src/studio/core/state/history/actions/*.ts` | Command actions | ⚠️ Refactor |

### Timeline

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/studio/components/timeline/KonvaTimeline.tsx` | Main timeline | ✅ Good |
| `frontend/src/studio/components/timeline/konva/*.tsx` | Timeline parts | ✅ Good |
| `frontend/src/studio/components/shared/konva/useKonvaInteractions.ts` | Interactions | ⚠️ Refactor |

### Persistence

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/studio/core/auto-save/AutoSaveService.ts` | Auto-save | ✅ Good |
| `frontend/src/studio/core/db/dexie-client.ts` | IndexedDB | ✅ Good |
| `frontend/src/platform/api/projects.ts` | Backend API | ✅ Good |

---

## Conclusion

BeatGen has a solid foundation with well-designed audio engine decoupling, a command pattern for undo, and canvas-based timeline rendering. The main architectural gaps are:

1. **Missing Controller Layer** - Side effects are scattered
2. **Dual State Systems** - MIDI notes not in main store
3. **No Patch System** - Full state updates instead of diffs

Addressing these in phases will enable:
- Real-time collaboration
- Better debugging and testing
- Improved performance
- Cleaner, more maintainable code

The migration can be done incrementally, with Phase 1 (Unify State) and Phase 2 (Controller Layer) being the highest priority items that will unlock the most value.
