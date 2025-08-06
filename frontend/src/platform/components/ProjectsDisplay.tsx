import React from 'react';
import { Plus, Music } from 'lucide-react';
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Card, CardContent } from "../../components/ui/card";
import { ProjectWithTrackPreviews } from '../types/project';
import { Button } from "../../components/ui/button";
import ProjectCard from './DisplayCards/ProjectCard';
import { PrefetchStatus as PrefetchStatusType } from '../hooks/useProjectPrefetch';
import { IconFolder } from '@tabler/icons-react';
const logoColors = [
  '#e539a9', // Bright Pink
  '#c63ba6', // Magenta
  '#a93fbf', // Dark Violet
  '#8247d8', // Purple
  '#6050e0', // Indigo
  '#4160e2', // Blue
];

interface ProjectsDisplayProps {
  allFetchedProjects: ProjectWithTrackPreviews[];
  displayedProjectsCount: number;
  totalProjectsOnServer: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  onCreateNewProject: () => void;
  onOpenProject: (projectId: string) => void;
  onEditProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onShowMore: () => void;
  snackbarOpen: boolean;
  snackbarMessage: string;
  snackbarSeverity: 'success' | 'error';
  onCloseSnackbar: () => void;
  sectionColor: string;
  getPrefetchStatus?: (projectId: string) => PrefetchStatusType | undefined;
}

const ProjectsDisplay: React.FC<ProjectsDisplayProps> = ({
  allFetchedProjects,
  displayedProjectsCount,
  totalProjectsOnServer,
  loading,
  loadingMore,
  error,
  onCreateNewProject,
  onOpenProject,
  onEditProject,
  onDeleteProject,
  onShowMore,
  snackbarOpen,
  snackbarMessage,
  snackbarSeverity,
  onCloseSnackbar,
  sectionColor,
  getPrefetchStatus,
}) => {
  return (
    <React.Fragment>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card className="project-empty-state flex flex-col items-center py-8 mt-2">
          <CardContent className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
            <p className="text-muted-foreground">
              Loading your projects...
            </p>
          </CardContent>
        </Card>
      ) : allFetchedProjects.length === 0 ? (
        <Card className="project-empty-state flex flex-col items-center py-8 mt-2 text-center">
          <CardContent className="flex flex-col items-center">
            <IconFolder className="project-empty-icon w-15 h-15 mb-2" />
            <h3 
              className="text-lg font-semibold mb-2"
              style={{ 
                color: logoColors[1],
              }}
            >
              No projects yet
            </h3>
            <p className="text-muted-foreground mb-4">
              Create your first music project to get started!
            </p>
            <Button 
              variant="default"
              className="flex items-center gap-2"
              onClick={onCreateNewProject}
            >
              <Plus className="w-4 h-4" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-2">
          {allFetchedProjects.slice(0, displayedProjectsCount).map((project) => (
            <div key={project.id}>
              <ProjectCard 
                project={project}
                onOpenProject={onOpenProject}
                onEditProject={onEditProject}
                onDeleteProject={onDeleteProject}
                sectionColor={sectionColor}
                getPrefetchStatus={getPrefetchStatus}
              />
            </div>
          ))}
        </div>
      )}

      {/* Show More Button */} 
      {!loading && displayedProjectsCount < totalProjectsOnServer && (
        <div className="flex justify-center mt-4 mb-2">
          <Button 
            variant="outline"
            onClick={onShowMore} 
            disabled={loadingMore}
          >
            Show More
          </Button>
        </div>
      )}

      {/* Note: Replaced Snackbar with a simpler approach - consider implementing toast system */}
      {snackbarOpen && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <Alert variant={snackbarSeverity === 'error' ? 'destructive' : 'default'} className="w-auto">
            <AlertDescription>{snackbarMessage}</AlertDescription>
          </Alert>
        </div>
      )}
    </React.Fragment>
  );
};

export default ProjectsDisplay;
