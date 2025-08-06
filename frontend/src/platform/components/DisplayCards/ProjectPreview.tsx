import React, { useMemo } from 'react';
import { ProjectWithTrackPreviews, TrackInstance } from '../../types/project';
import { getTrackColor } from "../../../studio/constants/gridConstants";
import { Separator } from "../../../components/ui/separator";

interface ProjectPreviewProps {
  project: ProjectWithTrackPreviews;
}

const ProjectPreview: React.FC<ProjectPreviewProps> = ({ project }) => {
  // Filter tracks that have instance metadata
  // Exclude sampler tracks (they should only be shown as part of drum tracks)
  const tracksWithInstances = project.track_previews?.filter(
    track => track.instance_metadata && 
             track.instance_metadata.length > 0 &&
             track.track_type !== 'SAMPLER'
  ) || [];

  // Calculate the scale for the preview
  // Find the maximum position to determine scale
  const maxPosition = useMemo(() => {
    let max = 0;
    tracksWithInstances.forEach(track => {
      track.instance_metadata?.forEach((instance: TrackInstance) => {
        const endPosition = instance.x_position + (instance.trim_end_ticks - instance.trim_start_ticks);
        if (endPosition > max) max = endPosition;
      });
    });
    return max;
  }, [tracksWithInstances]);

  // Scale factor to fit preview in available width (use more of the card width)
  const scaleFactor = maxPosition > 0 ? 240 / maxPosition : 1;

  if (tracksWithInstances.length === 0) {
    // Show "No Tracks" message when no tracks have instances
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-sm text-muted-foreground">No Tracks</div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center overflow-hidden px-2">
      <div className="flex flex-col gap-1 w-full">
        {tracksWithInstances.map((track) => (
          <div 
            key={track.id}
            className="flex items-center justify-center h-3"
          >
            <div className="relative h-2 w-full">
              {/* Show track instances as bars positioned absolutely */}
              {track.instance_metadata?.map((instance: TrackInstance) => {
                // Calculate width based on trim values
                const instanceWidth = (instance.trim_end_ticks - instance.trim_start_ticks) * scaleFactor;
                const instanceLeft = instance.x_position * scaleFactor;
                
                return (
                  <div
                    key={instance.id}
                    className="absolute h-2 rounded-[2px]"
                    style={{
                      backgroundColor: getTrackColor(track.track_number),
                      opacity: track.mute ? 0.3 : 0.7,
                      width: `${Math.max(2, instanceWidth)}px`, // Minimum 2px width for visibility
                      left: `${instanceLeft}px`
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectPreview;