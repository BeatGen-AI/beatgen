import React from 'react';
import {
  Card, 
  CardFooter, 
  CardHeader, 
  CardTitle
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Separator } from "../../../components/ui/separator";
import { FolderOpen } from 'lucide-react';
import { IconTrashFilled } from '@tabler/icons-react';
import { Project } from '../../types/project';
import { cn } from "../../../lib/utils";

interface ProjectCardProps {
  project: Project;
  onOpenProject: (projectId: string) => void;
  onEditProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  sectionColor: string;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onOpenProject,
  onEditProject,
  onDeleteProject,
  sectionColor,
}) => {
  return (
    <Card 
      className={cn(
        "project-card w-full h-[200px] flex flex-col rounded-lg hover-shadow-card"
      )}
      style={{ '--hover-shadow-color': sectionColor } as React.CSSProperties}
    >
      {/* Fixed height header */}
      <CardHeader className="flex flex-row items-center justify-between p-2 h-[40px] flex-shrink-0">
        <div className="flex items-center min-w-0 flex-1">
          <FolderOpen className="text-primary mr-2" size={18} />
          <CardTitle className="text-sm font-medium truncate">{project.name}</CardTitle>
        </div>
      </CardHeader>
      
      {/* Fixed height preview area */}
      <div className="flex-1 flex items-center justify-center px-3 py-1 overflow-hidden">
        <div className="w-full h-full max-h-[80px] flex flex-col items-center justify-center">
          <Separator className="w-full mb-2" />
          <div className="project-metadata flex justify-between items-center text-sm text-muted-foreground w-full px-4">
            <p>BPM: {project.bpm}</p>
            <p>Key: {project.key_signature}</p>
          </div>
          <Separator className="w-full mt-2" />
        </div>
      </div>
      
      {/* Fixed height footer */}
      <CardFooter className="p-2 h-[40px] flex items-center gap-2 flex-shrink-0">
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
      </CardFooter>
    </Card>
  );
};

export default ProjectCard;
