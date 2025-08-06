import React from 'react';
import {
  Card, 
  CardFooter, 
  CardHeader, 
  CardTitle
} from "../../../components/ui/card";
import {
  FadeCard,
  FadeCardFooter,
  FadeCardHeader,
  FadeCardTitle
} from "../../../components/ui/fade-card";
import { Button } from "../../../components/ui/button";
import { FolderOpen } from 'lucide-react';
import { IconTrashFilled, IconKey, IconMetronome, IconPlaylist } from '@tabler/icons-react';
import { ProjectWithTrackPreviews } from '../../types/project';
import { cn } from "../../../lib/utils";
import PrefetchStatus from '../PrefetchStatus';
import { PrefetchStatus as PrefetchStatusType } from '../../hooks/useProjectPrefetch';
import { CARD_HEIGHTS } from "../../constants/cardDimensions";
import ProjectPreview from './ProjectPreview';

interface ProjectCardProps {
  project: ProjectWithTrackPreviews;
  onOpenProject: (projectId: string) => void;
  onEditProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  sectionColor: string;
  getPrefetchStatus?: (projectId: string) => PrefetchStatusType | undefined;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onOpenProject,
  onEditProject,
  onDeleteProject,
  sectionColor,
  getPrefetchStatus,
}) => {
  return (
    <FadeCard 
      className="project-card w-full flex flex-col rounded-lg hover-shadow-card"
      reverseFade={true}
      style={{ 
        '--hover-shadow-color': sectionColor,
        height: `${CARD_HEIGHTS.DISPLAY_CARD}px`
      } as React.CSSProperties}
    >
      {/* Fixed height header */}
      <FadeCardHeader 
        className="flex flex-row items-center justify-between px-3 py-2.5 flex-shrink-0"
        style={{ height: `${CARD_HEIGHTS.DISPLAY_CARD_HEADER}px` }}
      >
        <div className="flex items-center min-w-0 flex-1">
          <FolderOpen className="text-primary mr-2" size={16} />
          <FadeCardTitle className="text-sm font-medium truncate mr-3">{project.name}</FadeCardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <IconMetronome size={12} />
              <span>{project.bpm}</span>
            </div>
            <div className="flex items-center gap-1">
              <IconKey size={12} />
              <span>{project.key_signature?.replace(/\s+minor/i, 'm').replace(/\s+major/i, 'M')}</span>
            </div>
            <div className="flex items-center gap-1">
              <IconPlaylist size={12} />
              <span>{project.track_previews?.length || 0}</span>
            </div>
          </div>
        </div>
        {project.id && getPrefetchStatus && (
          <div className="ml-2">
            <PrefetchStatus projectId={project.id} getPrefetchStatus={getPrefetchStatus} />
          </div>
        )}
      </FadeCardHeader>
      
      {/* Fixed height preview area with overflow handling */}
      <div 
        className="px-3 py-1 overflow-hidden"
        style={{ height: `${CARD_HEIGHTS.DISPLAY_CARD_CONTENT}px` }}
      >
        <ProjectPreview project={project} />
      </div>
      
      {/* Fixed height footer - always at bottom */}
      <FadeCardFooter 
        className="px-2 pb-3 pt-1 flex items-center gap-2 flex-shrink-0 mt-auto"
        style={{ height: `${CARD_HEIGHTS.DISPLAY_CARD_FOOTER}px` }}
      >
        <Button
          size="sm"
          onClick={() => onOpenProject(project.id!)}
          className="flex-grow"
          variant="outline"
        >
          Open
        </Button>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => onDeleteProject(project.id!)} 
          aria-label="delete"
          className="h-8 w-8"
        >
          <IconTrashFilled size={18} />
        </Button>
      </FadeCardFooter>
    </FadeCard>
  );
};

export default ProjectCard;
