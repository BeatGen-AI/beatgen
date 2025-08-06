import React, { useMemo } from 'react';
import { ProjectWithTrackPreviews, TrackInstance } from '../../types/project';
import { getTrackColor } from "../../../studio/constants/gridConstants";
import { Separator } from "../../../components/ui/separator";

// Constants for preview rendering
const PREVIEW_WIDTH_PX = 280;
const TRACK_HEIGHT_PX = 12;
const TRACK_HEIGHT_CLASS = 'h-[12px]';
const MAX_VISIBLE_TRACKS = 5;
const MIN_INSTANCE_WIDTH_PX = 2;
const MUTED_OPACITY = 0.15;
const NORMAL_OPACITY = 0.65;

interface ProjectPreviewProps {
  project: ProjectWithTrackPreviews;
}

const ProjectPreview: React.FC<ProjectPreviewProps> = ({ project }) => {
  // Filter tracks that have instance metadata
  // Exclude sampler tracks (they should only be shown as part of drum tracks)
  const tracksWithInstances = project.track_previews?.filter(
    track => track.instance_metadata?.length > 0 &&
             track.track_type !== 'SAMPLER'
  ) || [];

  // Calculate the scale for the preview
  // Find the maximum position to determine scale
  const maxPosition = useMemo(() => {
    let max = 0;
    tracksWithInstances.forEach(track => {
      track.instance_metadata?.forEach((instance) => {
        // Type assertion through unknown for auto-generated types
        const typedInstance = instance as unknown as TrackInstance;
        const endPosition = typedInstance.x_position + (typedInstance.trim_end_ticks - typedInstance.trim_start_ticks);
        if (endPosition > max) max = endPosition;
      });
    });
    return max;
  }, [project.track_previews]); // Use stable dependency

  // Scale factor to fit preview in available width
  const scaleFactor = maxPosition > 0 ? PREVIEW_WIDTH_PX / maxPosition : 1;

  if (tracksWithInstances.length === 0) {
    // Show "No Tracks" message when no tracks have instances
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-sm text-muted-foreground">No Tracks</div>
      </div>
    );
  }

  return (
    <div className="h-full flex justify-center overflow-hidden pt-2">
      <div className="flex flex-col gap-[3px] items-center w-full">
        {tracksWithInstances.slice(0, MAX_VISIBLE_TRACKS).map((track) => (
          <div 
            key={track.id}
            className="relative h-[12px]"
            style={{ width: `${PREVIEW_WIDTH_PX}px` }}
          >
            {/* Show track instances as bars positioned absolutely */}
            {track.instance_metadata?.map((instance) => {
              // Type assertion through unknown for auto-generated types
              const typedInstance = instance as unknown as TrackInstance;
              // Calculate width based on trim values
              const instanceWidth = (typedInstance.trim_end_ticks - typedInstance.trim_start_ticks) * scaleFactor;
              const instanceLeft = typedInstance.x_position * scaleFactor;
              
              return (
                <div
                  key={typedInstance.id}
                  className="absolute h-[12px] rounded-[3px]"
                  style={{
                    backgroundColor: getTrackColor(track.track_number),
                    opacity: track.mute ? MUTED_OPACITY : NORMAL_OPACITY,
                    width: `${Math.max(MIN_INSTANCE_WIDTH_PX, instanceWidth)}px`,
                    left: `${instanceLeft}px`
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectPreview;