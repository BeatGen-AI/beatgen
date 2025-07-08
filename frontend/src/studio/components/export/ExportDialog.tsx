import React, { useState, useCallback } from 'react';
import {
  Box,
  Modal,
  IconButton,
  Typography,
  Button,
  LinearProgress,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  useTheme,
  Stack,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import { useStudioStore } from '../../stores/studioStore';
import { ExportService } from '../../core/export/ExportService';
import { ExportOptions, ExportProgress } from '../../core/export/types';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

const modalStyle = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 500,
  bgcolor: 'background.paper',
  borderRadius: 2,
  boxShadow: 24,
  p: 0,
  maxHeight: '90vh',
  overflow: 'auto',
};

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const theme = useTheme();
  const { tracks, projectTitle, bpm } = useStudioStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportService] = useState(() => new ExportService());
  
  // Export settings
  const [format, setFormat] = useState<'wav' | 'mp3' | 'flac'>('wav');
  const [sampleRate, setSampleRate] = useState<44100 | 48000 | 96000>(44100);
  const [bitDepth, setBitDepth] = useState<16 | 24 | 32>(16);
  const [normalize, setNormalize] = useState(true);
  const [exportStems, setExportStems] = useState(false);
  
  const handleExport = useCallback(async () => {
    if (isExporting) return;
    
    setIsExporting(true);
    setExportProgress(null);
    
    try {
      // Calculate export time range (for now, export entire project)
      const projectDuration = Math.max(
        ...tracks.map(track => {
          if (!track.instances || track.instances.length === 0) return 0;
          // Find the last instance end time
          return Math.max(...track.instances.map(instance => {
            const startTime = (instance.x_position / 480) * (60 / bpm); // Convert ticks to seconds
            const duration = (track.duration_ticks / 480) * (60 / bpm);
            return startTime + duration;
          }));
        }),
        10 // Minimum 10 seconds
      );
      
      const options: Omit<ExportOptions, 'format'> = {
        sampleRate,
        bitDepth,
        startTime: 0,
        endTime: projectDuration,
        normalize,
        stems: exportStems
      };
      
      const progressCallback = (progress: ExportProgress) => {
        setExportProgress(progress);
      };
      
      let result: Blob | Map<string, Blob>;
      
      if (exportStems) {
        // Export individual stems
        result = await exportService.exportStems(tracks, options, progressCallback);
        
        // Download each stem
        result.forEach((blob, trackId) => {
          const track = tracks.find(t => t.id === trackId);
          const filename = ExportService.generateFilename(
            projectTitle || 'project',
            format,
            track?.name
          );
          ExportService.downloadBlob(blob, filename);
        });
      } else {
        // Export single file
        if (format === 'wav') {
          result = await exportService.exportToWAV(tracks, options, progressCallback);
        } else {
          // TODO: Implement MP3 and FLAC export
          throw new Error(`${format.toUpperCase()} export not yet implemented`);
        }
        
        // Download the file
        const filename = ExportService.generateFilename(projectTitle || 'project', format);
        ExportService.downloadBlob(result as Blob, filename);
      }
      
      // Success
      setTimeout(() => {
        onClose();
      }, 1000);
      
    } catch (error) {
      console.error('Export failed:', error);
      setExportProgress({
        stage: 'error',
        percent: 0,
        message: error instanceof Error ? error.message : 'Export failed'
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    isExporting,
    tracks,
    projectTitle,
    bpm,
    format,
    sampleRate,
    bitDepth,
    normalize,
    exportStems,
    exportService,
    onClose
  ]);
  
  const handleCancel = useCallback(() => {
    if (isExporting) {
      exportService.cancel();
    }
    onClose();
  }, [isExporting, exportService, onClose]);
  
  return (
    <Modal
      open={open}
      onClose={handleCancel}
      aria-labelledby="export-dialog-title"
    >
      <Box sx={modalStyle}>
        {/* Header */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
        }}>
          <Typography id="export-dialog-title" variant="h6">
            Export Project
          </Typography>
          <IconButton
            onClick={handleCancel}
            size="small"
            sx={{ color: 'text.secondary' }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
        
        {/* Content */}
        <Box sx={{ p: 3 }}>
          <Stack spacing={3}>
            {/* Format Selection */}
            <FormControl component="fieldset">
              <FormLabel component="legend">Format</FormLabel>
              <RadioGroup
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
              >
                <FormControlLabel
                  value="wav"
                  control={<Radio size="small" />}
                  label="WAV (Lossless)"
                />
                <FormControlLabel
                  value="mp3"
                  control={<Radio size="small" />}
                  label="MP3 (Coming soon)"
                  disabled
                />
                <FormControlLabel
                  value="flac"
                  control={<Radio size="small" />}
                  label="FLAC (Coming soon)"
                  disabled
                />
              </RadioGroup>
            </FormControl>
            
            {/* Quality Settings */}
            {format === 'wav' && (
              <>
                <FormControl component="fieldset">
                  <FormLabel component="legend">Sample Rate</FormLabel>
                  <RadioGroup
                    value={sampleRate.toString()}
                    onChange={(e) => setSampleRate(parseInt(e.target.value) as any)}
                  >
                    <FormControlLabel
                      value="44100"
                      control={<Radio size="small" />}
                      label="44.1 kHz (CD Quality)"
                    />
                    <FormControlLabel
                      value="48000"
                      control={<Radio size="small" />}
                      label="48 kHz (Professional)"
                    />
                    <FormControlLabel
                      value="96000"
                      control={<Radio size="small" />}
                      label="96 kHz (High Resolution)"
                    />
                  </RadioGroup>
                </FormControl>
                
                <FormControl component="fieldset">
                  <FormLabel component="legend">Bit Depth</FormLabel>
                  <RadioGroup
                    value={bitDepth.toString()}
                    onChange={(e) => setBitDepth(parseInt(e.target.value) as any)}
                  >
                    <FormControlLabel
                      value="16"
                      control={<Radio size="small" />}
                      label="16-bit (CD Quality)"
                    />
                    <FormControlLabel
                      value="24"
                      control={<Radio size="small" />}
                      label="24-bit (Professional)"
                    />
                    <FormControlLabel
                      value="32"
                      control={<Radio size="small" />}
                      label="32-bit Float (Maximum Quality)"
                    />
                  </RadioGroup>
                </FormControl>
              </>
            )}
            
            {/* Export Options */}
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={normalize}
                    onChange={(e) => setNormalize(e.target.checked)}
                    size="small"
                  />
                }
                label="Normalize audio to prevent clipping"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={exportStems}
                    onChange={(e) => setExportStems(e.target.checked)}
                    size="small"
                  />
                }
                label="Export individual tracks (stems)"
              />
            </Box>
            
            {/* Progress */}
            {exportProgress && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {exportProgress.currentTrack || exportProgress.message}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {Math.round(exportProgress.percent)}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={exportProgress.percent}
                  sx={{ height: 6, borderRadius: 3 }}
                />
                {exportProgress.stage === 'error' && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {exportProgress.message}
                  </Alert>
                )}
              </Box>
            )}
          </Stack>
        </Box>
        
        {/* Footer */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
        }}>
          <Button variant="outlined" onClick={handleCancel} disabled={isExporting}>
            {isExporting ? 'Cancel' : 'Close'}
          </Button>
          <Button
            variant="contained"
            onClick={handleExport}
            disabled={isExporting || tracks.length === 0}
            startIcon={!isExporting && <DownloadIcon />}
          >
            {isExporting ? 'Processing...' : 'Export'}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}