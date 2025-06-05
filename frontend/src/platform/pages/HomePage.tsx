import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { 
  Container, 
  Typography, 
  Card, 
  CardContent, 
  Grid, 
  IconButton, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  TextField,
  CircularProgress,
  Box,
  Divider,
  Paper,
  Alert,
  Snackbar
} from '@mui/material';
import './styles/Projects.css';
import { 
  Add as AddIcon, 
  Delete as DeleteIcon, 
  Edit as EditIcon, 
  MusicNote as MusicNoteIcon,
  ArrowBack as ArrowBackIcon,
  Menu as MenuIcon
} from '@mui/icons-material';
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
import ProjectsDisplay from '../components/ProjectsDisplay';
import AudioTracksDisplay from '../components/AudioTracksDisplay';
import MidiLibrary from '../components/MidiLibrary';
import SamplerLibrary from '../components/SamplerLibrary';
import DrumLibrary from '../components/DrumLibrary';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page } from '../types/pagination';
// We'll define logoColors here since we're not importing from SimpleSidebar anymore
const logoColors = [
  '#e539a9', // Bright Pink
  '#c63ba6', // Magenta
  '#a93fbf', // Dark Violet
  '#8247d8', // Purple
  '#6050e0', // Indigo
  '#4160e2', // Blue
];
import GenerateSongModal from '../components/GenerateSongModal';
import { createProject } from '../api/projects';
import { ProjectCreate } from '../types/project';
import { isAuthenticated } from '../auth/auth-utils';

// Import shared pagination constants
import { TRACK_PAGINATION_CONFIG } from '../constants/pagination';

// Use standardized constants for projects (homepage shows fewer initially)
const INITIAL_DISPLAY_COUNT = 6; // Homepage specific - show fewer initially
const { DISPLAY_INCREMENT, API_PAGE_SIZE: PROJECTS_PER_PAGE_API } = TRACK_PAGINATION_CONFIG.PROJECTS;
const FETCH_THRESHOLD = 10; // When to fetch more from API

// const drawerWidth = 240; // No longer needed
// const collapsedDrawerWidth = 60; // No longer needed

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userIsAuthenticated = isAuthenticated();

  const [displayedProjectsCount, setDisplayedProjectsCount] = useState<number>(INITIAL_DISPLAY_COUNT);
  const [currentPageApi, setCurrentPageApi] = useState<number>(1);

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
  });
  
  const allFetchedProjects = projectsData?.items ?? [];
  const totalProjectsOnServer = projectsData?.total_items ?? 0;

  useEffect(() => {
    if (projectsData?.items) {
      const initialDisplay = Math.min(INITIAL_DISPLAY_COUNT, projectsData.items.length);
      setDisplayedProjectsCount(initialDisplay);
    }
  }, [projectsData?.items]);

  const fetchSounds = () => {
    console.log('Refreshing sounds library');
  };

  const handleShowMoreProjects = () => {
    const newDisplayedCount = Math.min(
      displayedProjectsCount + DISPLAY_INCREMENT,
      allFetchedProjects.length
    );
    setDisplayedProjectsCount(newDisplayedCount);

    const hasMoreOnServer = allFetchedProjects.length < totalProjectsOnServer;
    if (newDisplayedCount >= allFetchedProjects.length && hasMoreOnServer && !isFetchingProjects) {
      if (projectsData && currentPageApi < projectsData.total_pages ) {
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
    },
    onError: (err) => {
      console.error('Error deleting project:', err);
      showSnackbar('Failed to delete project', 'error');
    },
  });

  const handleDeleteListedProject = async (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      performDeleteProject(projectId);
    }
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
        navigate({ to: '/register' });
      }
      return;
    }
    
    try {
      console.log('Saving generated song as project:', generatedData);
      
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

  // If user is not authenticated, show a simpler layout for guests
  if (!userIsAuthenticated) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Header for guests */}
        <header style={{ padding: '1rem 2rem', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 'bold', color: logoColors[3] }}>
            BeatGen Studio
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outline" onClick={() => navigate({ to: '/login' })}>
              Login
            </Button>
            <Button variant="default" onClick={() => navigate({ to: '/register' })}>
              Sign Up
            </Button>
          </Box>
        </header>

        {/* Main content for guests */}
        <main style={{ flexGrow: 1, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Paper elevation={2} sx={{ p: 4, maxWidth: 600, width: '100%', textAlign: 'center' }}>
            <Typography variant="h4" sx={{ mb: 2, color: logoColors[1] }}>
              Generate Your Song
            </Typography>
            <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
              Create music instantly with AI. Try our song generator for free!
            </Typography>
            
            <Button
              variant="default"
              size="lg"
              onClick={() => setShowGenerateSongModal(true)}
              // startIcon={<MusicNoteIcon />}
              // sx={{ mb: 2 }}
            >
              Generate Song
            </Button>
            
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Sign up to save your generated songs as projects
            </Typography>
          </Paper>
        </main>

        {/* Generate Song Modal */}
        <GenerateSongModal
          open={showGenerateSongModal}
          onClose={() => setShowGenerateSongModal(false)}
          onSaveAsProject={handleSaveGeneratedSong}
        />
      </Box>
    );
  }

  return (
    <div className="p-4 md:p-8">
      {/* Main Content */}
        <Container maxWidth="lg" className="projects-container" sx={{ pt: 0, mt:0 }}>

          {projectsError && (
            <Alert severity="error" sx={{ mb: 4 }}>
              {projectsError.message || 'Failed to load projects. Please try again later.'}
            </Alert>
          )}

          <Paper elevation={2} sx={{ p: 3, mt: 0, borderRadius: 2 }}>
            <Box sx={{ mb: 2 }}>
              {/* Desktop layout - side by side */}
              <Box sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography 
                  variant="h5" 
                  component="h2" 
                  sx={{ fontWeight: 'medium' }}
                  style={{ 
                    color: logoColors[1], // Projects
                  }}
                >
                  Projects
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={() => setShowGenerateSongModal(true)}
                  >
                    <MusicNoteIcon fontSize="small" />
                    Generate Song
                  </Button>
                  <Button
                    variant="default"
                    className="flex items-center gap-2"
                    onClick={handleCreateProject}
                  >
                    <AddIcon fontSize="small" />
                    New Project
                  </Button>
                </Box>
              </Box>

              {/* Mobile layout - stacked */}
              <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 2 }}>
                <Typography 
                  variant="h5" 
                  component="h2" 
                  sx={{ fontWeight: 'medium' }}
                  style={{ 
                    color: logoColors[1], // Projects
                  }}
                >
                  Projects
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 justify-center"
                    onClick={() => setShowGenerateSongModal(true)}
                  >
                    <MusicNoteIcon fontSize="small" />
                    Generate Song
                  </Button>
                  <Button
                    variant="default"
                    className="flex items-center gap-2 justify-center"
                    onClick={handleCreateProject}
                  >
                    <AddIcon fontSize="small" />
                    New Project
                  </Button>
                </Box>
              </Box>
            </Box>
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
              sectionColor={logoColors[1]}
            />
          </Paper>

          {/* My Sounds Section is now replaced by AudioTracksDisplay */}
          <Paper elevation={2} sx={{ p: 3, mt: 4, borderRadius: 2 }}>
            <Typography 
              variant="h5" 
              component="h2" 
              sx={{ mb: 2, fontWeight: 'medium' }}
              style={{
                color: logoColors[2], // Audio Tracks
              }}
            >
              Audio Tracks
            </Typography>
            <AudioTracksDisplay onReloadSounds={fetchSounds} sectionColor={logoColors[2]} />
          </Paper>

          {/* Midi Tracks Section */}
          <Paper elevation={2} sx={{ p: 3, mt: 4, borderRadius: 2 }}>
            <Typography 
              variant="h5" 
              component="h2" 
              sx={{ mb: 2, fontWeight: 'medium' }}
              style={{
                color: logoColors[3], // MIDI Tracks
              }}
            >
              MIDI Tracks
            </Typography>
            <MidiLibrary sectionColor={logoColors[3]} />
          </Paper>

          {/* Sampler Tracks Section */}
          <Paper elevation={2} sx={{ p: 3, mt: 4, borderRadius: 2 }}>
            <Typography 
              variant="h5" 
              component="h2" 
              sx={{ mb: 2, fontWeight: 'medium' }}
              style={{
                color: logoColors[4], // Sampler Tracks
              }}
            >
              Sampler Tracks
            </Typography>
            <SamplerLibrary sectionColor={logoColors[4]} />
          </Paper>

          {/* Drum Tracks Section */}
          <Paper elevation={2} sx={{ p: 3, mt: 4, borderRadius: 2, mb: 4 }}>
            <Typography 
              variant="h5" 
              component="h2" 
              sx={{ mb: 2, fontWeight: 'medium' }}
              style={{
                color: logoColors[5], // Drum Tracks
              }}
            >
              Drum Tracks
            </Typography>
            <DrumLibrary sectionColor={logoColors[5]} />
          </Paper>

          {/* Snackbar for notifications */}
          <Snackbar 
            open={snackbar.open && !loadingProjects}
            autoHideDuration={6000} 
            onClose={handleCloseSnackbar}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          >
            <Alert 
              onClose={handleCloseSnackbar} 
              severity={snackbar.severity} 
              variant="filled"
            >
              {snackbar.message}
            </Alert>
          </Snackbar>
      </Container>

      {/* Generate Song Modal */}
      <GenerateSongModal
        open={showGenerateSongModal}
        onClose={() => setShowGenerateSongModal(false)}
        onSaveAsProject={handleSaveGeneratedSong}
      />
    </div>
  );
}