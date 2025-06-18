# Platform Types Structure

This directory organizes TypeScript types used throughout the platform. Here's how it's structured:

## Directory Structure

### `/dto` - Data Transfer Objects (Auto-generated)
**⚠️ NEVER EDIT FILES IN THIS DIRECTORY ⚠️**

All files in `/dto` are automatically generated from Python Pydantic models. Any manual changes will be lost on the next generation.

- Contains pure DTOs that match the backend API models
- Includes all track models, user models, project models, etc.
- Updated by running the pydantic-to-typescript generation script

### `/entities` - Extended Types
When you need to add client-side properties to a DTO:

1. Create a new type with the `Entity` suffix
2. Extend the corresponding DTO
3. Add your client-side properties

Example:
```typescript
// In entities/project.ts
import { CombinedTrack as CombinedTrackDTO } from '../dto/project';

export interface CombinedTrackEntity extends CombinedTrackDTO {
  dirty?: boolean; // Client-side only
  instances?: TrackInstance[]; // Client-side only
}
```

### Root `/types` Directory
Contains:
- `adapters.ts` - Functions to convert between API and internal types
- `pagination.ts` - Pagination-related types
- `project.ts` - Re-exports from both dto and entities for backward compatibility
- Other utility types that don't fit into dto or entities

## Usage Guidelines

1. **Import DTOs directly** when you only need the API model:
   ```typescript
   import { Project } from 'platform/types/dto/project';
   ```

2. **Import entities** when you need extended types with client-side properties:
   ```typescript
   import { ProjectWithTracksEntity } from 'platform/types/entities/project';
   ```

3. **Use the root re-exports** for backward compatibility:
   ```typescript
   import { Project, CombinedTrack } from 'platform/types/project';
   ```

## Adding New Types

- **Auto-generated types**: Update the Python Pydantic models and regenerate
- **Client extensions**: Create in `/entities` with `Entity` suffix
- **Utility types**: Add to the root `/types` directory

Remember: The separation ensures we never lose auto-generated types and makes it clear which types have client-side extensions.