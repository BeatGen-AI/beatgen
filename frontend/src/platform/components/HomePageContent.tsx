import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { FadeCard } from '../../components/ui/fade-card';
import { Plus as AddIcon } from 'lucide-react';
import { GRID_CONSTANTS } from '../../studio/constants/gridConstants';
import ProjectsDisplay from './ProjectsDisplay';
import AudioTracksDisplay from './AudioTracksDisplay';
import MidiLibrary from './MidiLibrary';
import SamplerLibrary from './SamplerLibrary';
import DrumLibrary from './DrumLibrary';
import { TrackSelectionBar } from './TrackSelectionBar';
import { useTrackSelection } from '../context/TrackSelectionContext';
import { createProject } from '../api/projects';
import { ProjectCreate } from '../types/project';

interface HomePageContentProps {
  allFetchedProjects: any[];
  displayedProjectsCount: number;
  totalProjectsOnServer: number;
  loadingProjects: boolean;
  isFetchingProjects: boolean;
  projectsError: Error | null;
  currentPageApi: number;
  handleCreateProject: () => void;
  openListedProject: (projectId: string) => void;
  handleEditListedProject: (projectId: string) => void;
  handleDeleteListedProject: (projectId: string) => void;
  handleShowMoreProjects: () => void;
  snackbar: {
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  };
  handleCloseSnackbar: () => void;
  fetchSounds: () => void;
  getPrefetchStatus: (projectId: string) => any;
  enableTrackSelection: boolean;
  setEnableTrackSelection: (enabled: boolean) => void;
}

export const HomePageContent: React.FC<HomePageContentProps> = ({
  allFetchedProjects,
  displayedProjectsCount,
  totalProjectsOnServer,
  loadingProjects,
  isFetchingProjects,
  projectsError,
  currentPageApi,
  handleCreateProject,
  openListedProject,
  handleEditListedProject,
  handleDeleteListedProject,
  handleShowMoreProjects,
  snackbar,
  handleCloseSnackbar,
  fetchSounds,
  getPrefetchStatus,
  enableTrackSelection,
  setEnableTrackSelection,
}) => {
  const navigate = useNavigate();
  const { selectedTracks, clearSelection } = useTrackSelection();

  const handleOpenProjectWithTracks = async () => {
    if (selectedTracks.size === 0) return;

    try {
      // Create a new project
      const projectData: ProjectCreate = {
        name: `New Project - ${new Date().toLocaleString()}`,
        bpm: 120,
        time_signature_numerator: 4,
        time_signature_denominator: 4,
        key_signature: 'C major',
      };
      
      const newProject = await createProject(projectData);
      
      // Navigate to studio with the new project and selected tracks
      const trackIds = Array.from(selectedTracks.keys());
      const trackTypes = Array.from(selectedTracks.values()).map(info => info.trackType);
      
      navigate({ 
        to: '/studio',
        search: { 
          projectId: newProject.id,
          selectedTracks: trackIds.join(','),
          trackTypes: trackTypes.join(',')
        } as any
      });
      
      // Clear selection after navigation
      clearSelection();
      setEnableTrackSelection(false);
    } catch (error) {
      console.error('Failed to create project with tracks:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto projects-container px-2 py-2 md:px-4 md:py-4">
        {projectsError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              {projectsError.message || 'Failed to load projects. Please try again later.'}
            </AlertDescription>
          </Alert>
        )}

        <FadeCard className="p-6 mt-0">
          <div className="mb-2">
            <div className="hidden md:flex justify-between items-center">
              <h2 
                className="text-2xl font-medium"
                style={{ 
                  color: GRID_CONSTANTS.logoColors[1],
                }}
              >
                Projects
              </h2>
              <div className="flex gap-2">
                <Button
                  variant={enableTrackSelection ? "secondary" : "outline"}
                  className="flex items-center gap-2"
                  onClick={() => setEnableTrackSelection(!enableTrackSelection)}
                >
                  Select Tracks
                </Button>
                <Button
                  variant="default"
                  className="flex items-center gap-2"
                  onClick={handleCreateProject}
                >
                  <AddIcon fontSize="small" />
                  New Project
                </Button>
              </div>
            </div>

            <div className="flex md:hidden flex-col gap-4">
              <h2 
                className="text-2xl font-medium"
                style={{ 
                  color: GRID_CONSTANTS.logoColors[1],
                }}
              >
                Projects
              </h2>
              <div className="flex flex-col gap-2">
                <Button
                  variant={enableTrackSelection ? "secondary" : "outline"}
                  className="flex items-center gap-2 justify-center"
                  onClick={() => setEnableTrackSelection(!enableTrackSelection)}
                >
                  Select Tracks
                </Button>
                <Button
                  variant="default"
                  className="flex items-center gap-2 justify-center"
                  onClick={handleCreateProject}
                >
                  <AddIcon fontSize="small" />
                  New Project
                </Button>
              </div>
            </div>
          </div>
          <ProjectsDisplay
            allFetchedProjects={allFetchedProjects}
            displayedProjectsCount={displayedProjectsCount}
            totalProjectsOnServer={totalProjectsOnServer}
            loading={loadingProjects}
            loadingMore={isFetchingProjects && currentPageApi > 1}
            error={projectsError ? projectsError.message : null}
            onCreateNewProject={handleCreateProject}
            onOpenProject={openListedProject}
            onEditProject={handleEditListedProject}
            onDeleteProject={handleDeleteListedProject}
            onShowMore={handleShowMoreProjects}
            snackbarOpen={snackbar.open}
            snackbarMessage={snackbar.message}
            snackbarSeverity={snackbar.severity}
            onCloseSnackbar={handleCloseSnackbar}
            sectionColor={GRID_CONSTANTS.logoColors[1]}
            getPrefetchStatus={getPrefetchStatus}
          />
        </FadeCard>

        <FadeCard className="p-6 mt-8">
          <div className="mb-2">
            <h2 
              className="text-2xl font-medium"
              style={{
                color: GRID_CONSTANTS.logoColors[2],
              }}
            >
              Audio Tracks
            </h2>
          </div>
          <AudioTracksDisplay 
            onReloadSounds={fetchSounds} 
            sectionColor={GRID_CONSTANTS.logoColors[2]} 
            useUiMode={true} 
            enableSelection={enableTrackSelection}
          />
        </FadeCard>

        <FadeCard className="p-6 mt-8">
          <div className="mb-2">
            <h2 
              className="text-2xl font-medium"
              style={{
                color: GRID_CONSTANTS.logoColors[3],
              }}
            >
              MIDI Tracks
            </h2>
          </div>
          <MidiLibrary 
            sectionColor={GRID_CONSTANTS.logoColors[3]} 
            enableSelection={enableTrackSelection}
          />
        </FadeCard>

        <FadeCard className="p-6 mt-8">
          <div className="mb-2">
            <h2 
              className="text-2xl font-medium"
              style={{
                color: GRID_CONSTANTS.logoColors[4],
              }}
            >
              Sampler Tracks
            </h2>
          </div>
          <SamplerLibrary 
            sectionColor={GRID_CONSTANTS.logoColors[4]}
            enableSelection={enableTrackSelection}
          />
        </FadeCard>

        <FadeCard className="p-6 mt-8 mb-8">
          <div className="mb-2">
            <h2 
              className="text-2xl font-medium"
              style={{
                color: GRID_CONSTANTS.logoColors[5],
              }}
            >
              Drum Tracks
            </h2>
          </div>
          <DrumLibrary 
            sectionColor={GRID_CONSTANTS.logoColors[5]}
            enableSelection={enableTrackSelection}
          />
        </FadeCard>

        {snackbar.open && !loadingProjects && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
            <Alert 
              variant={snackbar.severity === 'error' ? 'destructive' : 'default'}
              className={`${snackbar.severity === 'success' ? 'border-green-500 text-green-700 bg-green-50' : ''}`}
            >
              <AlertDescription>{snackbar.message}</AlertDescription>
            </Alert>
          </div>
        )}
      </div>

      <TrackSelectionBar onOpenProject={handleOpenProjectWithTracks} />
    </div>
  );
};