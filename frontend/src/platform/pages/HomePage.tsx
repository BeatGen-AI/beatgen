import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { usePageTheme } from '../../lib/theme-provider';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import './styles/Projects.css';
import { 
  Plus as AddIcon, 
  Trash2 as DeleteIcon, 
  Edit as EditIcon, 
  Music as MusicNoteIcon,
  ArrowLeft as ArrowBackIcon,
  Menu as MenuIcon
} from 'lucide-react';
import SoundUploader from '../components/SoundUploader';
import SoundLibrary from '../components/SoundLibrary';
import { useAuth } from '../auth/auth-context';
import { 
  getProjects, 
  deleteProject, 
} from '../api/projects';
import { Project } from '../types/project';
import { IconTrashFilled } from '@tabler/icons-react';
import { Button } from "../../components/ui/button"
import { FadeCard, FadeCardHeader, FadeCardTitle, FadeCardContent } from "../../components/ui/fade-card"
import ProjectsDisplay from '../components/ProjectsDisplay';
import AudioTracksDisplay from '../components/AudioTracksDisplay';
import MidiLibrary from '../components/MidiLibrary';
import SamplerLibrary from '../components/SamplerLibrary';
import DrumLibrary from '../components/DrumLibrary';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page } from '../types/pagination';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import GenerateSongModal from '../components/GenerateSongModal';
import { GRID_CONSTANTS } from '../../studio/constants/gridConstants';
import { createProject } from '../api/projects';
import { ProjectCreate } from '../types/project';
import { isAuthenticated } from '../auth/auth-utils';
import { useProjectPrefetch } from '../hooks/useProjectPrefetch';

// Import shared pagination constants
import { TRACK_PAGINATION_CONFIG } from '../constants/pagination';

// Use standardized constants for projects (homepage shows fewer initially)
const INITIAL_DISPLAY_COUNT = 6; // Homepage specific - show fewer initially
const { DISPLAY_INCREMENT, API_PAGE_SIZE: PROJECTS_PER_PAGE_API } = TRACK_PAGINATION_CONFIG.PROJECTS;
const FETCH_THRESHOLD = 10; // When to fetch more from API

// const drawerWidth = 240; // No longer needed
// const collapsedDrawerWidth = 60; // No longer needed

export default function HomePage() {
  // Apply homepage theme
  usePageTheme('homepage');
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userIsAuthenticated = isAuthenticated();
  const { prefetchProject, getPrefetchStatus, isProjectCached } = useProjectPrefetch();

  const [displayedProjectsCount, setDisplayedProjectsCount] = useState<number>(INITIAL_DISPLAY_COUNT);
  const [currentPageApi, setCurrentPageApi] = useState<number>(1);
  const [allFetchedProjects, setAllFetchedProjects] = useState<Project[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const [showSoundUploader, setShowSoundUploader] = useState(false);
  const [showGenerateSongModal, setShowGenerateSongModal] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success'
  });

  const { 
    data: projectsData, 
    isLoading: loadingProjects, 
    error: projectsError,
    isFetching: isFetchingProjects,
  } = useQuery<Page<Project>, Error, Page<Project>, [string, number, number]>({
    queryKey: ['projects', currentPageApi, PROJECTS_PER_PAGE_API],
    queryFn: () => getProjects(currentPageApi, PROJECTS_PER_PAGE_API),
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    enabled: userIsAuthenticated, // Only fetch if user is authenticated
  });
  
  const totalProjectsOnServer = projectsData?.total_items ?? 0;
  const totalPagesApi = projectsData?.total_pages ?? 0;

  // Accumulate projects when new pages are fetched
  useEffect(() => {
    if (projectsData?.items) {
      if (currentPageApi === 1) {
        // First page - replace all items
        setAllFetchedProjects(projectsData.items);
        setDisplayedProjectsCount(Math.min(INITIAL_DISPLAY_COUNT, projectsData.items.length));
      } else {
        // Additional pages - append to existing items
        setAllFetchedProjects(prev => [...prev, ...projectsData.items]);
      }
    }
  }, [projectsData?.items, currentPageApi]);

  // Prefetch visible projects for instant loading
  useEffect(() => {
    if (!userIsAuthenticated) return; // Only prefetch for authenticated users
    
    // Get currently visible projects
    const visibleProjects = allFetchedProjects.slice(0, displayedProjectsCount);
    
    // Prefetch each visible project (the hook already checks if cached)
    visibleProjects.forEach(project => {
      if (project.id) {
        // Check if already fully cached (metadata + audio + soundfonts)
        const isFullyCached = isProjectCached(project.id);
        
        if (!isFullyCached) {
          prefetchProject(project.id).catch(error => {
            console.error(`Failed to prefetch project ${project.id}:`, error);
          });
        }
      }
    });
  }, [allFetchedProjects, displayedProjectsCount, prefetchProject, isProjectCached, userIsAuthenticated]);

  const fetchSounds = () => {
    queryClient.invalidateQueries({ queryKey: ['audioTracks'] });
  };

  const handleShowMoreProjects = () => {
    const newDisplayedCount = Math.min(
      displayedProjectsCount + DISPLAY_INCREMENT,
      allFetchedProjects.length
    );
    setDisplayedProjectsCount(newDisplayedCount);

    if (newDisplayedCount >= allFetchedProjects.length && allFetchedProjects.length < totalProjectsOnServer && !isFetchingProjects) {
      if (currentPageApi < totalPagesApi) {
        setCurrentPageApi(prev => prev + 1);
      }
    }
  };

  const handleCreateProject = () => {
    navigate({ to: '/studio' });
  };

  const handleEditListedProject = (projectId: string) => {
    navigate({ 
      to: '/studio',
      search: { projectId } as any
    });
  };

  const { mutate: performDeleteProject } = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      showSnackbar('Project deleted successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    },
    onError: (err) => {
      console.error('Error deleting project:', err);
      showSnackbar('Failed to delete project', 'error');
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    },
  });

  const handleDeleteListedProject = async (projectId: string) => {
    setProjectToDelete(projectId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteProject = () => {
    if (projectToDelete) {
      performDeleteProject(projectToDelete);
    }
  };

  const cancelDeleteProject = () => {
    setDeleteDialogOpen(false);
    setProjectToDelete(null);
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({
      open: true,
      message,
      severity
    });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({
      ...snackbar,
      open: false
    });
  };

  const openListedProject = (projectId: string) => {
    navigate({ 
      to: '/studio',
      search: { projectId } as any
    });
  };

  const handleSaveGeneratedSong = async (generatedData: any) => {
    // Check if user is authenticated
    if (!userIsAuthenticated) {
      // Show signup prompt for guests
      if (window.confirm('You need to create an account to save your generated song. Would you like to sign up now?')) {
        // Auth modal will handle registration
      }
      return;
    }
    
    try {
      
      // Check if project was already created by homepage API
      if (generatedData.project_id) {
        // Project already exists, just navigate to it
        showSnackbar('Opening your generated song in studio...', 'success');
        navigate({ 
          to: '/studio',
          search: { projectId: generatedData.project_id } as any
        });
        return;
      }
      
      // Fallback: Create project manually (for assistant API results)
      const projectData: ProjectCreate = {
        id: crypto.randomUUID(), // Generate UUID to ensure consistent project ID
        name: generatedData.project_name || `Generated Song - ${new Date().toLocaleString()}`,
        bpm: generatedData.tempo || 120,
        time_signature_numerator: 4,
        time_signature_denominator: 4,
        key_signature: generatedData.key || generatedData.key_signature || 'C major',
      };
      
      // Create the project
      const newProject = await createProject(projectData);
      
      showSnackbar('Song saved as project! Opening in studio...', 'success');
      
      // Navigate to studio with the new project
      navigate({ 
        to: '/studio',
        search: { projectId: newProject.id } as any
      });
      
    } catch (error) {
      console.error('Failed to save generated song as project:', error);
      showSnackbar('Failed to save song as project. Please try again.', 'error');
    }
  };

  // Remove the special layout for unauthenticated users
  // All users will see the same homepage interface

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Main Content */}
        <div className="max-w-6xl mx-auto projects-container px-2 py-2 md:px-4 md:py-4">

          {projectsError && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {projectsError.message || 'Failed to load projects. Please try again later.'}
              </AlertDescription>
            </Alert>
          )}

          <FadeCard className="p-6 mt-0">
            <div className="mb-2">
              {/* Desktop layout - side by side */}
              <div className="hidden md:flex justify-between items-center">
                <h2 
                  className="text-2xl font-medium"
                  style={{ 
                    color: GRID_CONSTANTS.logoColors[1], // Projects
                  }}
                >
                  Projects
                </h2>
                <div className="flex gap-2">
                  {/* <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={() => setShowGenerateSongModal(true)}
                  >
                    <MusicNoteIcon fontSize="small" />
                    Generate Song
                  </Button> */}
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={handleCreateProject}
                  >
                    <AddIcon fontSize="small" />
                    New Project
                  </Button>
                </div>
              </div>

              {/* Mobile layout - stacked */}
              <div className="flex md:hidden flex-col gap-4">
                <h2 
                  className="text-2xl font-medium"
                  style={{ 
                    color: GRID_CONSTANTS.logoColors[1], // Projects
                  }}
                >
                  Projects
                </h2>
                <div className="flex flex-col gap-2">
                  {/* <Button
                    variant="outline"
                    className="flex items-center gap-2 justify-center"
                    onClick={() => setShowGenerateSongModal(true)}
                  >
                    <MusicNoteIcon fontSize="small" />
                    Generate Song
                  </Button> */}
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

          {/* My Sounds Section is now replaced by AudioTracksDisplay */}
          <FadeCard className="p-6 mt-8">
            <div className="mb-2">
              <h2 
                className="text-2xl font-medium"
                style={{
                  color: GRID_CONSTANTS.logoColors[2], // Audio Tracks
                }}
              >
                Audio Tracks
              </h2>
            </div>
            <AudioTracksDisplay onReloadSounds={fetchSounds} sectionColor={GRID_CONSTANTS.logoColors[2]} useUiMode={true} />
          </FadeCard>

          {/* Midi Tracks Section */}
          <FadeCard className="p-6 mt-8">
            <div className="mb-2">
              <h2 
                className="text-2xl font-medium"
                style={{
                  color: GRID_CONSTANTS.logoColors[3], // MIDI Tracks
                }}
              >
                MIDI Tracks
              </h2>
            </div>
            <MidiLibrary sectionColor={GRID_CONSTANTS.logoColors[3]} />
          </FadeCard>

          {/* Sampler Tracks Section */}
          <FadeCard className="p-6 mt-8">
            <div className="mb-2">
              <h2 
                className="text-2xl font-medium"
                style={{
                  color: GRID_CONSTANTS.logoColors[4], // Sampler Tracks
                }}
              >
                Sampler Tracks
              </h2>
            </div>
            <SamplerLibrary sectionColor={GRID_CONSTANTS.logoColors[4]} />
          </FadeCard>

          {/* Drum Tracks Section */}
          <FadeCard className="p-6 mt-8 mb-8">
            <div className="mb-2">
              <h2 
                className="text-2xl font-medium"
                style={{
                  color: GRID_CONSTANTS.logoColors[5], // Drum Tracks
                }}
              >
                Drum Tracks
              </h2>
            </div>
            <DrumLibrary sectionColor={GRID_CONSTANTS.logoColors[5]} />
          </FadeCard>

          {/* Toast-like notifications using Alert */}
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

      {/* Generate Song Modal */}
      <GenerateSongModal
        open={showGenerateSongModal}
        onClose={() => setShowGenerateSongModal(false)}
        onSaveAsProject={handleSaveGeneratedSong}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDeleteProject}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteProject}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}