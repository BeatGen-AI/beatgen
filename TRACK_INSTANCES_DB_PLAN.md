# Track Instances Database Integration Plan

## Overview
Implement full database persistence for track instances, allowing them to be saved and loaded with projects.

## Current State
- Track instances exist only in frontend React state
- Properties: `id`, `trackId`, `x` (position in ticks), `width` (duration in ticks), `color`, `name`
- No backend persistence

## Architecture Overview

### Database Schema
```sql
CREATE TABLE track_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    track_id UUID NOT NULL,
    track_type VARCHAR(50) NOT NULL, -- AUDIO, MIDI, SAMPLER, DRUM
    x_position INTEGER NOT NULL, -- position in ticks
    width_ticks INTEGER NOT NULL, -- duration in ticks
    color VARCHAR(7), -- hex color
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Composite foreign key to project_tracks
    FOREIGN KEY (project_id, track_id) REFERENCES project_tracks(project_id, track_id) ON DELETE CASCADE
);

CREATE INDEX idx_track_instances_project_id ON track_instances(project_id);
CREATE INDEX idx_track_instances_track_id ON track_instances(track_id);
CREATE INDEX idx_track_instances_composite ON track_instances(project_id, track_id);
```

## Implementation Steps

### 1. Backend: Database Model (Task #45)
Create SQLAlchemy model in `backend/app2/models/track_instance.py`:
```python
from typing import Optional, TYPE_CHECKING
import uuid
from sqlmodel import Field, Relationship
from sqlalchemy import Column, ForeignKeyConstraint, Enum as SAEnum
from app2.models.base import DefaultUUIDStandardBase
from app2.types.track_types import TrackType

if TYPE_CHECKING:
    from app2.models.project import Project
    from app2.models.project_track import ProjectTrack

class TrackInstance(DefaultUUIDStandardBase, table=True):
    __tablename__ = "track_instances"
    
    # Foreign keys
    project_id: uuid.UUID = Field(nullable=False, index=True)
    track_id: uuid.UUID = Field(nullable=False, index=True)
    track_type: TrackType = Field(sa_column=Column(SAEnum(TrackType), nullable=False))
    
    # Instance properties
    x_position: int = Field(nullable=False)  # position in ticks
    width_ticks: int = Field(nullable=False)  # duration in ticks
    color: Optional[str] = Field(default=None, max_length=7)  # hex color
    name: Optional[str] = Field(default=None, max_length=255)
    
    # Relationships
    project: Optional["Project"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[TrackInstance.project_id]"}
    )
    
    project_track: Optional["ProjectTrack"] = Relationship(
        sa_relationship_kwargs={
            "primaryjoin": "and_(TrackInstance.project_id == ProjectTrack.project_id, "
                          "TrackInstance.track_id == ProjectTrack.track_id)",
            "foreign_keys": "[TrackInstance.project_id, TrackInstance.track_id]"
        }
    )
    
    # Table-level constraints
    __table_args__ = (
        ForeignKeyConstraint(
            ['project_id', 'track_id'],
            ['project_tracks.project_id', 'project_tracks.track_id'],
            ondelete="CASCADE"
        ),
    )

# API Models
class TrackInstanceRead(SQLModel):
    id: uuid.UUID
    project_id: uuid.UUID
    track_id: uuid.UUID
    track_type: TrackType
    x_position: int
    width_ticks: int
    color: Optional[str]
    name: Optional[str]
    created_at: datetime
    updated_at: datetime

class TrackInstanceCreate(SQLModel):
    project_id: uuid.UUID
    track_id: uuid.UUID
    track_type: TrackType
    x_position: int
    width_ticks: int
    color: Optional[str] = None
    name: Optional[str] = None

class TrackInstanceUpdate(SQLModel):
    x_position: Optional[int] = None
    width_ticks: Optional[int] = None
    color: Optional[str] = None
    name: Optional[str] = None
```

Update ProjectTrack model to include:
```python
instances: List["TrackInstance"] = Relationship(
    back_populates="project_track",
    sa_relationship_kwargs={
        "primaryjoin": "and_(ProjectTrack.project_id == TrackInstance.project_id, "
                       "ProjectTrack.track_id == TrackInstance.track_id)",
        "foreign_keys": "[TrackInstance.project_id, TrackInstance.track_id]"
    }
)
```

### 2. Backend: Database Migration (Task #46)
Create alembic migration:
```bash
cd backend
alembic revision -m "add_track_instances_table"
```

Migration file content:
```python
"""add_track_instances_table

Revision ID: xxx
Revises: yyy
Create Date: 2025-01-16

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade():
    op.create_table(
        'track_instances',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('track_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('track_type', sa.Enum('AUDIO', 'MIDI', 'SAMPLER', 'DRUM', name='tracktype'), nullable=False),
        sa.Column('x_position', sa.Integer(), nullable=False),
        sa.Column('width_ticks', sa.Integer(), nullable=False),
        sa.Column('color', sa.String(7), nullable=True),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(
            ['project_id', 'track_id'],
            ['project_tracks.project_id', 'project_tracks.track_id'],
            ondelete='CASCADE'
        )
    )
    op.create_index('idx_track_instances_project_id', 'track_instances', ['project_id'])
    op.create_index('idx_track_instances_track_id', 'track_instances', ['track_id'])
    op.create_index('idx_track_instances_composite', 'track_instances', ['project_id', 'track_id'])

def downgrade():
    op.drop_index('idx_track_instances_composite')
    op.drop_index('idx_track_instances_track_id')
    op.drop_index('idx_track_instances_project_id')
    op.drop_table('track_instances')
```

### 3. Backend: API Endpoints (Task #47)
Create `backend/app2/routes/track_instances.py`:

```python
# GET /api/projects/{project_id}/track-instances
# GET /api/tracks/{track_id}/instances
# POST /api/track-instances
# PUT /api/track-instances/{instance_id}
# DELETE /api/track-instances/{instance_id}
# POST /api/track-instances/batch-update (for group operations)
```

### 3. Frontend: TypeScript Types (Task #48)
Create `frontend/src/studio/types/trackInstance.ts`:
```typescript
interface TrackInstance {
  id: string;
  trackId: string;
  projectId: string;
  x: number; // position in ticks
  width: number; // duration in ticks
  color?: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

### 4. Frontend: API Service (Task #49)
Create `frontend/src/studio/services/trackInstanceService.ts`:
```typescript
class TrackInstanceService {
  async getByProject(projectId: string): Promise<TrackInstance[]>
  async getByTrack(trackId: string): Promise<TrackInstance[]>
  async create(instance: Omit<TrackInstance, 'id'>): Promise<TrackInstance>
  async update(id: string, updates: Partial<TrackInstance>): Promise<TrackInstance>
  async delete(id: string): Promise<void>
  async batchUpdate(updates: Array<{id: string, changes: Partial<TrackInstance>}>): Promise<TrackInstance[]>
}
```

### 5. Frontend: State Management Integration (Task #50-52)
Update `KonvaTimeline.tsx`:

```typescript
// Add to KonvaTimeline component
const [instances, setInstances] = useState<TrackInstance[]>([]);
const [pendingUpdates, setPendingUpdates] = useState<Map<string, Partial<TrackInstance>>>(new Map());
const updateDebounceRef = useRef<NodeJS.Timeout>();

// Load instances on mount
useEffect(() => {
  if (projectId) {
    trackInstanceService.getByProject(projectId).then(setInstances);
  }
}, [projectId]);

// Handle instance creation
const handleCreateInstance = async (trackId: string, x: number, width: number) => {
  const tempId = `temp-${Date.now()}`;
  const newInstance = {
    id: tempId,
    trackId,
    projectId,
    track_type: getTrackType(trackId),
    x,
    width,
    color: getTrackColor(trackId),
    name: `Instance ${instances.length + 1}`
  };
  
  // Optimistic update
  setInstances([...instances, newInstance]);
  
  try {
    const created = await trackInstanceService.create(newInstance);
    // Replace temp instance with server response
    setInstances(prev => prev.map(inst => 
      inst.id === tempId ? created : inst
    ));
  } catch (error) {
    // Rollback on error
    setInstances(prev => prev.filter(inst => inst.id !== tempId));
    showError('Failed to create instance');
  }
};

// Handle batch updates with debouncing
const handleInstanceUpdate = (id: string, updates: Partial<TrackInstance>) => {
  // Update local state immediately
  setInstances(prev => prev.map(inst => 
    inst.id === id ? { ...inst, ...updates } : inst
  ));
  
  // Queue update for backend
  setPendingUpdates(prev => new Map(prev).set(id, {
    ...prev.get(id),
    ...updates
  }));
  
  // Debounce backend sync
  clearTimeout(updateDebounceRef.current);
  updateDebounceRef.current = setTimeout(() => {
    syncPendingUpdates();
  }, 500);
};

// Sync pending updates to backend
const syncPendingUpdates = async () => {
  const updates = Array.from(pendingUpdates.entries()).map(([id, changes]) => ({
    id,
    changes
  }));
  
  if (updates.length === 0) return;
  
  try {
    await trackInstanceService.batchUpdate(updates);
    setPendingUpdates(new Map());
  } catch (error) {
    showError('Failed to save changes');
    // Keep updates in queue for retry
  }
};
```

### 6. Auto-save Strategy (Task #51)
- Immediate save on: create, delete
- Debounced save (500ms) on: position change, resize
- Batch updates for group operations
- Queue system for handling rapid changes

### 7. Error Handling (Task #53)
- Retry logic for failed saves
- User notification on errors
- Rollback optimistic updates on failure
- Offline queue for sync when connection restored

## API Request Flow

### Loading Instances
1. Studio.tsx loads project
2. Fetch all track instances for project
3. Pass instances to KonvaTimeline
4. Render instances on canvas

### Creating Instance
1. User creates instance in UI
2. Optimistically add to state
3. POST to `/api/track-instances`
4. Update with server response (get server-generated ID)

### Updating Instance
1. User drags/resizes instance
2. Update local state immediately
3. Debounce and batch updates
4. PUT to `/api/track-instances/batch-update`

### Deleting Instance
1. User deletes instance
2. Optimistically remove from state
3. DELETE to `/api/track-instances/{id}`
4. Confirm deletion or rollback

## Testing Plan
1. Create multiple instances across tracks
2. Reload page - verify instances persist
3. Test group operations (move/resize multiple)
4. Test error scenarios (network failure)
5. Test concurrent updates from multiple tabs
6. Performance test with 100+ instances

## Migration Strategy
1. Deploy backend changes first
2. Run migration to create tables
3. Deploy frontend with feature flag
4. Enable feature flag after testing
5. Monitor for errors and performance

## Integration with Current KonvaTimeline

### Current State
- Instances stored in `trackInstancesRef.current` as a Map
- Each instance has: `id`, `trackId`, `x`, `width`, `color`, `name`
- Instances are created/updated/deleted through UI interactions

### Required Changes
1. **Add projectId to instances**: Currently missing, needed for API
2. **Sync with backend**: Replace local-only storage with API calls
3. **Handle loading state**: Show skeleton/spinner while loading
4. **Update instance IDs**: Use server-generated UUIDs instead of local IDs
5. **Add error boundaries**: Handle network failures gracefully

### Code Changes in KonvaTimeline:
```typescript
// Current (local only)
const createInstance = (trackId: string, x: number) => {
  const id = `instance-${Date.now()}`;
  const instance = { id, trackId, x, width: snapSize * 4, color, name };
  trackInstancesRef.current.set(id, instance);
};

// New (with backend sync)
const createInstance = async (trackId: string, x: number) => {
  const instance = {
    trackId,
    projectId: project.id,
    track_type: findTrackType(trackId),
    x_position: x,
    width_ticks: snapSize * 4,
    color: getTrackColor(trackId),
    name: `Instance ${trackInstancesRef.current.size + 1}`
  };
  
  // Optimistic update with temp ID
  const tempInstance = { ...instance, id: `temp-${Date.now()}` };
  trackInstancesRef.current.set(tempInstance.id, tempInstance);
  forceUpdate();
  
  try {
    const created = await trackInstanceService.create(instance);
    // Replace with server instance
    trackInstancesRef.current.delete(tempInstance.id);
    trackInstancesRef.current.set(created.id, created);
    forceUpdate();
  } catch (error) {
    // Rollback
    trackInstancesRef.current.delete(tempInstance.id);
    forceUpdate();
    showError('Failed to create instance');
  }
};
```

## Performance Considerations
1. **Batch Operations**: Group updates when moving/resizing multiple instances
2. **Debouncing**: Prevent excessive API calls during drag operations
3. **Caching**: Consider caching instances in Redux/Context for cross-component access
4. **Pagination**: If projects have many instances, implement pagination
5. **WebSocket**: Consider real-time sync for collaborative editing

## Security Considerations
1. **Authorization**: Verify user owns project before allowing instance operations
2. **Validation**: Validate instance positions/sizes on backend
3. **Rate Limiting**: Prevent spam creation of instances
4. **Audit Trail**: Log instance operations for debugging