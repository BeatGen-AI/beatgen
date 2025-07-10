import React from 'react';
import { 
  Box, 
  Typography, 
  Grid, 
  CircularProgress,
  Alert,
  Paper,
} from '@mui/material';
import { Button } from "../../../components/ui/button";

/**
 * Generic props for the PaginatedGrid component
 * T represents the type of items being displayed
 */
interface PaginatedGridProps<T> {
  // Data and state
  items: T[];
  displayedCount: number;
  totalItems: number;
  loading: boolean;
  loadingMore: boolean;
  error?: string | null;

  // Pagination controls
  onShowMore: () => void;
  canShowMore: boolean;

  // Rendering
  renderItem: (item: T, index: number) => React.ReactNode;
  getItemKey: (item: T, index: number) => string | number;

  // Empty state
  emptyState: {
    icon: React.ReactNode;
    title: string;
    description: string;
  };

  // Grid configuration
  gridProps?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };

  // Optional styling
  sectionColor?: string;
  className?: string;
}

/**
 * Reusable paginated grid component for displaying collections of items
 * with consistent "Show More" pagination behavior across all track types
 */
export function PaginatedGrid<T>({
  items,
  displayedCount,
  totalItems,
  loading,
  loadingMore,
  error,
  onShowMore,
  canShowMore,
  renderItem,
  getItemKey,
  emptyState,
  gridProps = { xs: 12, sm: 6, md: 4 },
  sectionColor,
  className,
}: PaginatedGridProps<T>) {
  
  // Show loading spinner on initial load
  if (loading) {
    return (
      <Paper sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, mt: 2 }}>
        <CircularProgress sx={{ mb: 2 }} />
        <Typography variant="body1" color="text.secondary">
          Loading...
        </Typography>
      </Paper>
    );
  }
  
  // Show error state
  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }
  
  // Show empty state when no items and not loading more
  if (items.length === 0 && !loadingMore) {
    return (
      <Paper sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, mt: 2, textAlign: 'center' }}>
        <Box sx={{ fontSize: 60, mb: 2 }}>
          {emptyState.icon}
        </Box>
        <Typography 
          variant="h6" 
          gutterBottom
          style={{ 
            color: sectionColor || '#666',
          }}
        >
          {emptyState.title}
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          {emptyState.description}
        </Typography>
      </Paper>
    );
  }
  
  // Calculate which items to display
  const displayedItems = items.slice(0, displayedCount);
  const showMoreButton = !loading && canShowMore && displayedCount < totalItems;
  
  return (
    <React.Fragment>
      {/* Grid of items */}
      <Grid container spacing={3} sx={{pt: 2}}>
        {displayedItems.map((item, index) => (
          <Grid item {...gridProps} key={getItemKey(item, index)}>
            {renderItem(item, index)}
          </Grid>
        ))}
      </Grid>
      
      {/* Show More Button */}
      {showMoreButton && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 2 }}>
          <Button 
            variant="outline"
            onClick={onShowMore} 
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Show More'}
          </Button>
        </Box>
      )}
      
      {/* Loading indicator when fetching more items */}
      {loadingMore && displayedItems.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, mb: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}
    </React.Fragment>
  );
}

/**
 * Type-safe wrapper functions for common use cases
 */

// Projects grid
export const ProjectsPaginatedGrid = PaginatedGrid<any>; // Replace 'any' with Project type

// Audio tracks grid  
export const AudioTracksPaginatedGrid = PaginatedGrid<any>; // Replace 'any' with AudioTrackRead type

// MIDI tracks grid
export const MidiTracksPaginatedGrid = PaginatedGrid<any>; // Replace 'any' with MidiTrackRead type

// Sampler tracks grid
export const SamplerTracksPaginatedGrid = PaginatedGrid<any>; // Replace 'any' with SamplerTrackRead type

// Drum tracks grid
export const DrumTracksPaginatedGrid = PaginatedGrid<any>; // Replace 'any' with DrumTrackRead type

/**
 * Default empty states for different track types
 */
export const DEFAULT_EMPTY_STATES = {
  PROJECTS: {
    icon: <div>📁</div>, // Replace with proper icon
    title: "No projects yet",
    description: "Create your first project to get started"
  },
  AUDIO_TRACKS: {
    icon: <div>🎵</div>, // Replace with proper icon
    title: "No sounds in your library",
    description: "Upload some sounds to get started"
  },
  MIDI_TRACKS: {
    icon: <div>🎹</div>, // Replace with proper icon
    title: "No MIDI tracks in your library",
    description: "Create MIDI tracks in the studio to see them here"
  },
  SAMPLER_TRACKS: {
    icon: <div>🎛️</div>, // Replace with proper icon
    title: "No sampler tracks in your library",
    description: "Create sampler tracks in the studio to see them here"
  },
  DRUM_TRACKS: {
    icon: <div>🥁</div>, // Replace with proper icon
    title: "No drum tracks in your library",
    description: "Create drum tracks in the studio to see them here"
  },
} as const;

export default PaginatedGrid;