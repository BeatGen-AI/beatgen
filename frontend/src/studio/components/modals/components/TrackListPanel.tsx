import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Music, Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { AudioTrackRead } from '../../../../platform/types/dto/track_models/audio_track';
import { getSoundsPaginated } from '../../../../platform/api/sounds';
import TrackCard from './TrackCard';

interface TrackListPanelProps {
  onSelectTrack: (track: AudioTrackRead) => void;
}

const TrackListPanel: React.FC<TrackListPanelProps> = ({ onSelectTrack }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [tracks, setTracks] = useState<AudioTrackRead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const ITEMS_PER_PAGE = 12;

  const handleTrackSelect = (track: AudioTrackRead) => {
    onSelectTrack(track);
  };

  // Fetch tracks function
  const fetchTracks = async (page: number, append: boolean = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setTracks([]);
    }
    setError(null);

    try {
      const result = await getSoundsPaginated(page, ITEMS_PER_PAGE);
      
      if (append) {
        setTracks(prev => [...prev, ...(result.items || [])]);
        setCurrentPage(prev => prev + 1);
      } else {
        setTracks(result.items || []);
        setCurrentPage(1);
      }
      setTotalItems(result.total_items || 0);
    } catch (err: unknown) {
      console.error("Error fetching audio tracks:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(errorMessage);
      if (!append) {
        setTracks([]);
        setTotalItems(0);
      }
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  // Load more function
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && currentPage < Math.ceil(totalItems / ITEMS_PER_PAGE)) {
      fetchTracks(currentPage + 1, true);
    }
  }, [isLoadingMore, currentPage, totalItems]);

  // Scroll detection for infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current && !isLoadingMore && currentPage < Math.ceil(totalItems / ITEMS_PER_PAGE)) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        // Trigger load more when user is 200px from the bottom
        if (scrollHeight - scrollTop <= clientHeight + 200) {
          handleLoadMore();
        }
      }
    };

    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, [isLoadingMore, currentPage, totalItems, handleLoadMore]);

  // Initial load when component mounts
  useEffect(() => {
    setCurrentPage(1);
    setTracks([]);
    fetchTracks(1, false);
  }, []);

  // Refresh tracks function for external use
  const refreshTracks = useCallback(() => {
    fetchTracks(1, false);
  }, []);

  // Expose refresh function via ref (could be used by parent)
  React.useImperativeHandle(
    React.forwardRef<{ refreshTracks: () => void }, TrackListPanelProps>(() => null),
    () => ({ refreshTracks }),
    [refreshTracks]
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div 
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto p-6 pt-0"
      >
        {isLoading && tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Loader2 className="w-12 h-12 animate-spin mb-4" />
            <p>Loading audio tracks...</p>
          </div>
        ) : error ? (
          <Alert variant="destructive" className="mb-4">
            Failed to load audio tracks: {error}
          </Alert>
        ) : (
          <>
            {/* Tracks List */}
            <div className="space-y-3 pb-4">
              {tracks.length === 0 && !isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Music className="w-16 h-16 mb-4" />
                  <p className="text-lg font-medium mb-2">No audio tracks found</p>
                  <p className="text-sm text-center">Upload some audio files to get started</p>
                </div>
              ) : (
                tracks.map((track) => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    onClick={() => handleTrackSelect(track)}
                  />
                ))
              )}
            </div>

            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2 text-muted-foreground">Loading more...</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TrackListPanel;