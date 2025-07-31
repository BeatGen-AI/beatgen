import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import './styles/Projects.css';
import { 
  ArrowLeft as ArrowBackIcon,
  Menu as MenuIcon
} from 'lucide-react';
import { 
  getProjects, 
  deleteProject, 
} from '../api/projects';
import { Project } from '../types/project';
import ProjectsDisplay from '../components/ProjectsDisplay';
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

// Import shared pagination constants
import { TRACK_PAGINATION_CONFIG } from '../constants/pagination';

const logoColors = [
  '#e539a9', // Bright Pink
  '#c63ba6', // Magenta
  '#a93fbf', // Dark Violet
  '#8247d8', // Purple
  '#6050e0', // Indigo
  '#4160e2', // Blue
];

// Use standardized constants
const { INITIAL_DISPLAY_COUNT, DISPLAY_INCREMENT, API_PAGE_SIZE: PROJECTS_PER_PAGE_API } = TRACK_PAGINATION_CONFIG.PROJECTS;

export default function Projects() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const projectsColor = logoColors[0]; // Bright Pink

  const [displayedProjectsCount, setDisplayedProjectsCount] = useState<number>(INITIAL_DISPLAY_COUNT);
  const [currentPageApi, setCurrentPageApi] = useState<number>(1);
  const [allFetchedProjects, setAllFetchedProjects] = useState<Project[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

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

  const handleShowMore = () => {
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

  const navigateToEditProject = (projectId: string) => {
    navigate({ 
      to: '/studio',
      search: { projectId } as any
    });
  };

  const { mutate: performDeleteProject, isPending: isDeletingProject } = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      showSnackbar('Project deleted successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    },
    onError: (err: Error) => {
      console.error('Error deleting project:', err);
      showSnackbar(`Failed to delete project: ${err.message}`, 'error');
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    },
  });

  const handleDeleteProject = async (projectId: string) => {
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

  const openProject = (projectId: string) => {
    navigate({ 
      to: '/studio',
      search: { projectId } as any
    });
  };

  return (
    <div className="p-8">
      <div className="container mx-auto max-w-5xl">
        <h1 
          className="text-3xl font-bold mb-6"
          style={{ 
            color: projectsColor, 
          }}
        >
          Projects
        </h1>
        <p className="text-muted-foreground mb-6">
          Manage your music projects. Create new projects or continue working on existing ones.
        </p>
        
        {projectsError && !projectsData && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {projectsError.message || 'Failed to load projects. Please try again later.'}
            </AlertDescription>
          </Alert>
        )}
        
        {/* Projects Component */}
        <div className="bg-card rounded-lg p-4 shadow-md">
          <ProjectsDisplay
            allFetchedProjects={allFetchedProjects}
            displayedProjectsCount={displayedProjectsCount}
            totalProjectsOnServer={totalProjectsOnServer}
            loading={loadingProjects && currentPageApi === 1}
            loadingMore={isFetchingProjects && currentPageApi > 1}
            error={projectsError ? projectsError.message : null}
            onCreateNewProject={handleCreateProject}
            onOpenProject={openProject}
            onEditProject={navigateToEditProject}
            onDeleteProject={handleDeleteProject}
            onShowMore={handleShowMore}
            snackbarOpen={snackbar.open}
            snackbarMessage={snackbar.message}
            snackbarSeverity={snackbar.severity}
            onCloseSnackbar={handleCloseSnackbar} 
            sectionColor={projectsColor}
          />
        </div>
      </div>

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
            <AlertDialogAction onClick={confirmDeleteProject} disabled={isDeletingProject}>
              {isDeletingProject ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}