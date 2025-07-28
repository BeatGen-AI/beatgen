import React from 'react';
import { Button } from "../../../components/ui/button";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Card, CardContent } from "../../../components/ui/card";
import { Skeleton } from "../../../components/ui/skeleton";
import { cn } from "../../../lib/utils";

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

  // Grid configuration (responsive grid columns)
  gridProps?: {
    xs?: number; // columns on extra small screens
    sm?: number; // columns on small screens  
    md?: number; // columns on medium screens
    lg?: number; // columns on large screens
    xl?: number; // columns on extra large screens
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
  gridProps = { xs: 1, sm: 2, md: 3 },
  sectionColor,
  className,
}: PaginatedGridProps<T>) {
  
  // Show loading spinner on initial load
  if (loading) {
    return (
      <Card className="flex flex-col items-center py-8 mt-2">
        <CardContent className="flex flex-col items-center space-y-4 pt-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }
  
  // Show error state
  if (error) {
    return (
      <Alert className="mt-2" variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  
  // Show empty state when no items and not loading more
  if (items.length === 0 && !loadingMore) {
    return (
      <Card className="flex flex-col items-center py-8 mt-2 text-center">
        <CardContent className="flex flex-col items-center space-y-4 pt-6">
          <div className="text-6xl mb-2">
            {emptyState.icon}
          </div>
          <h3 
            className="text-lg font-semibold"
            style={{ 
              color: sectionColor || '#666',
            }}
          >
            {emptyState.title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {emptyState.description}
          </p>
        </CardContent>
      </Card>
    );
  }
  
  // Calculate which items to display
  const displayedItems = items.slice(0, displayedCount);
  const showMoreButton = !loading && canShowMore && displayedCount < totalItems;
  
  // Build responsive grid classes based on gridProps
  const getGridClasses = () => {
    const { xs = 1, sm = 2, md = 3, lg = 4, xl = 5 } = gridProps;
    return cn(
      "grid gap-6 pt-2",
      `grid-cols-${xs}`,
      `sm:grid-cols-${sm}`,
      `md:grid-cols-${md}`,
      `lg:grid-cols-${lg}`,
      `xl:grid-cols-${xl}`,
      className
    );
  };
  
  return (
    <React.Fragment>
      {/* Grid of items */}
      <div className={getGridClasses()}>
        {displayedItems.map((item, index) => (
          <div key={getItemKey(item, index)}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
      
      {/* Show More Button */}
      {showMoreButton && (
        <div className="flex justify-center mt-4 mb-2">
          <Button 
            variant="outline"
            onClick={onShowMore} 
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Show More'}
          </Button>
        </div>
      )}
      
      {/* Loading indicator when fetching more items */}
      {loadingMore && displayedItems.length > 0 && (
        <div className="flex justify-center mt-2 mb-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
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