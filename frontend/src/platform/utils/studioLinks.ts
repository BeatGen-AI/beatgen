/**
 * Utility functions for generating links to open tracks in the studio
 */

export type TrackType = 'audio' | 'midi' | 'sampler' | 'drum';

/**
 * Generate a URL to open a track in the studio within a new project
 * @param trackId - The ID of the track to open
 * @param trackType - The type of track (audio, midi, sampler, drum)
 * @returns The studio URL with track parameters
 */
export function generateStudioTrackUrl(trackId: string, trackType: TrackType): string {
  const params = new URLSearchParams();
  params.set('trackId', trackId);
  params.set('trackType', trackType);
  
  return `/studio?${params.toString()}`;
}

/**
 * Open a track in the studio in a new tab/window
 * @param trackId - The ID of the track to open
 * @param trackType - The type of track (audio, midi, sampler, drum)
 * @param newTab - Whether to open in a new tab (default: true)
 */
export function openTrackInStudio(trackId: string, trackType: TrackType, newTab = true): void {
  const url = generateStudioTrackUrl(trackId, trackType);
  
  if (newTab) {
    window.open(url, '_blank');
  } else {
    window.location.href = url;
  }
}