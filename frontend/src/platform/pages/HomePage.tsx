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
import Sidebar from '../components/Sidebar';
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "../../components/ui/button"
import ProjectsDisplay from '../components/ProjectsDisplay';
import AudioTracksDisplay from '../components/AudioTracksDisplay';
import MidiLibrary from '../components/MidiLibrary';
import SamplerLibrary from '../components/SamplerLibrary';
import DrumLibrary from '../components/DrumLibrary';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page } from '../types/pagination';
import { logoColors } from '../components/Sidebar';
import GenerateSongModal from '../components/GenerateSongModal';
import { isAuthenticated } from '../auth/auth-utils';
import { useAutoSave } from '../../studio/hooks/useAutoSave';
import { useStudioStore } from '../../studio/stores/studioStore';

// Constants for pagination and display
const INITIAL_DISPLAY_COUNT = 6;
const DISPLAY_INCREMENT = 6; // How many more to show on each click (relevant later)
const FETCH_THRESHOLD = 10; // When to fetch more from API (relevant later)
const PROJECTS_PER_PAGE_API = 20; // How many to fetch from API at a time

// const drawerWidth = 240; // No longer needed
// const collapsedDrawerWidth = 60; // No longer needed

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { open: sidebarActualOpen } = useSidebar();
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

  // Initialize auto-save for generated projects
  const autoSave = useAutoSave({
    onSaveSuccess: (project) => {
      console.log('Generated song saved as project:', project.id);
      showSnackbar('Song saved as project! Opening in studio...', 'success');
      navigate({ 
        to: '/studio',
        search: { projectId: project.id } as any
      });
    },
    onSaveError: (error) => {
      console.error('Failed to save generated song:', error);
      showSnackbar('Failed to save song as project. Please try again.', 'error');
    }
  });

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
      
      // Get studio store state and functions
      const studioState = useStudioStore.getState();
      
      // Set project details from generated data
      studioState.handleProjectParamChange('projectTitle', `Generated Song - ${new Date().toLocaleString()}`);
      studioState.handleProjectParamChange('bpm', generatedData.tempo || 120);
      studioState.handleProjectParamChange('timeSignature', [
        generatedData.projectParams?.time_signature_numerator || 4,
        generatedData.projectParams?.time_signature_denominator || 4
      ] as [number, number]);
      studioState.handleProjectParamChange('keySignature', generatedData.key || 'C major');

      // Convert and add generated tracks to studio store
      if (generatedData.tracks && generatedData.tracks.length > 0) {
        const convertedTracks = [];
        for (const trackAction of generatedData.tracks) {
          // Convert SSE action to studio track format
          const combinedTrack = convertActionToStudioTrack(trackAction);
          if (combinedTrack) {
            convertedTracks.push(combinedTrack);
          }
        }
        
        // Set the tracks in the store (this marks them as dirty)
        if (convertedTracks.length > 0) {
          studioState.setTracks(convertedTracks);
        }
      }
      
      // Force save using auto-save (creates project and saves tracks)
      await autoSave.forceSave();
      
    } catch (error) {
      console.error('Failed to save generated song as project:', error);
      showSnackbar('Failed to save song as project. Please try again.', 'error');
    }
  };

  // Helper function to convert SSE action to studio track format
  const convertActionToStudioTrack = (trackAction: any) => {
    try {
      const trackData = trackAction.data?.track_data || trackAction.track_data;
      if (!trackData) return null;

      // Create combined track in studio format
      const combinedTrack = {
        id: trackData.id || crypto.randomUUID(),
        name: trackData.name || 'Generated Track',
        type: trackAction.type === 'add_drum_track' ? 'DRUM' : 'MIDI',
        track: trackData,
        // Mark as dirty so auto-save will save it
        dirty: true,
        // Default positioning
        x_position: 0,
        y_position: 0,
        volume: 1.0,
        pan: 0.0,
        mute: false
      };

      return combinedTrack;
    } catch (error) {
      console.error('Failed to convert track action:', error);
      return null;
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
    <Box sx={{ display: 'flex' }}>
      <Sidebar />
      <main
        style={{
          flexGrow: 1,
          padding: '2rem', // p-8 is 2rem if 1 unit = 0.25rem
          // marginLeft and transition removed - Sidebar component should manage its own width
          // and the main content will flow accordingly in the flex layout.
        }}
      >
        <Container maxWidth="lg" className="projects-container" sx={{ pt: 0, mt:0 }}>

          {projectsError && (
            <Alert severity="error" sx={{ mb: 4 }}>
              {projectsError.message || 'Failed to load projects. Please try again later.'}
            </Alert>
          )}

          <Paper elevation={2} sx={{ p: 3, mt: 0, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
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