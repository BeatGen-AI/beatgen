import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PAGINATION_CONSTANTS } from '../constants/pagination';
import { Page } from '../types/pagination';

/**
 * Configuration options for the pagination hook
 */
interface PaginationOptions {
  initialDisplayCount?: number;
  displayIncrement?: number;
  apiPageSize?: number;
  fetchThreshold?: number;
}

/**
 * Return type for the pagination hook
 */
interface PaginationResult<T> {
  // Data
  allFetchedItems: T[];
  displayedCount: number;
  totalItems: number;
  totalPages: number;
  
  // State
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  
  // Actions
  showMore: () => void;
  canShowMore: boolean;
  
  // Internal state (for debugging)
  currentPage: number;
}

/**
 * Custom hook for managing paginated data with display pagination
 * 
 * @param queryKey - React Query key for caching
 * @param fetchFn - Function to fetch paginated data from API
 * @param options - Configuration options
 * @returns Pagination state and controls
 */
export function usePagination<T>(
  queryKey: (string | number)[],
  fetchFn: (page: number, size: number) => Promise<Page<T>>,
  options: PaginationOptions = {}
): PaginationResult<T> {
  
  const {
    initialDisplayCount = PAGINATION_CONSTANTS.INITIAL_DISPLAY_COUNT,
    displayIncrement = PAGINATION_CONSTANTS.DISPLAY_INCREMENT,
    apiPageSize = PAGINATION_CONSTANTS.API_PAGE_SIZE,
    fetchThreshold = PAGINATION_CONSTANTS.FETCH_THRESHOLD,
  } = options;

  // State for pagination
  const [displayedCount, setDisplayedCount] = useState<number>(initialDisplayCount);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [allFetchedItems, setAllFetchedItems] = useState<T[]>([]);

  // React Query for API calls
  const { 
    data: pageData,
    isLoading,
    error,
    isFetching
  } = useQuery<Page<T>, Error>({
    queryKey: [...queryKey, currentPage, apiPageSize],
    queryFn: () => fetchFn(currentPage, apiPageSize),
    placeholderData: (previousData) => previousData,
  });

  const totalItems = pageData?.total_items ?? 0;
  const totalPages = pageData?.total_pages ?? 0;

  // Accumulate items when new pages are fetched
  useEffect(() => {
    if (pageData?.items) {
      if (currentPage === 1) {
        // First page - replace all items
        setAllFetchedItems(pageData.items);
        setDisplayedCount(Math.min(initialDisplayCount, pageData.items.length));
      } else {
        // Additional pages - append to existing items
        setAllFetchedItems(prev => [...prev, ...pageData.items]);
      }
    }
  }, [pageData?.items, currentPage, initialDisplayCount]);

  // Show more function
  const showMore = () => {
    const newDisplayedCount = Math.min(
      displayedCount + displayIncrement,
      allFetchedItems.length
    );
    setDisplayedCount(newDisplayedCount);

    // Check if we need to fetch more from API
    const shouldFetchMore = (
      newDisplayedCount >= allFetchedItems.length - fetchThreshold &&
      allFetchedItems.length < totalItems &&
      !isFetching &&
      currentPage < totalPages
    );

    if (shouldFetchMore) {
      setCurrentPage(prev => prev + 1);
    }
  };

  // Determine if we can show more
  const canShowMore = displayedCount < totalItems;

  return {
    // Data
    allFetchedItems,
    displayedCount,
    totalItems,
    totalPages,
    
    // State
    isLoading,
    isFetching,
    error: error?.message || null,
    
    // Actions
    showMore,
    canShowMore,
    
    // Debug
    currentPage,
  };
}

/**
 * Specialized hooks for different track types
 */

// Projects pagination hook
export function useProjectsPagination(
  fetchFn: (page: number, size: number) => Promise<Page<any>>,
  options?: PaginationOptions
) {
  return usePagination(['projects'], fetchFn, options);
}

// Audio tracks pagination hook
export function useAudioTracksPagination(
  fetchFn: (page: number, size: number) => Promise<Page<any>>,
  options?: PaginationOptions
) {
  return usePagination(['audioTracks'], fetchFn, options);
}

// MIDI tracks pagination hook
export function useMidiTracksPagination(
  fetchFn: (page: number, size: number) => Promise<Page<any>>,
  options?: PaginationOptions
) {
  return usePagination(['midiTracks'], fetchFn, options);
}

// Sampler tracks pagination hook
export function useSamplerTracksPagination(
  fetchFn: (page: number, size: number) => Promise<Page<any>>,
  options?: PaginationOptions
) {
  return usePagination(['samplerTracks'], fetchFn, {
    ...options,
    apiPageSize: 10, // Smaller page size for performance
  });
}

// Drum tracks pagination hook
export function useDrumTracksPagination(
  fetchFn: (page: number, size: number) => Promise<Page<any>>,
  options?: PaginationOptions
) {
  return usePagination(['drumTracks'], fetchFn, {
    ...options,
    apiPageSize: 10, // Smaller page size for performance
  });
}

export default usePagination;