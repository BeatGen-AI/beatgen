import React, { useState, useCallback, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { useStudioStore } from '../../stores/studioStore';
import { ExportService } from '../../core/export/ExportService';
import { ExportOptions, ExportProgress } from '../../core/export/types';
import { useAppTheme } from '../../../lib/theme-provider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group';
import { Checkbox } from '../../../components/ui/checkbox';
import { Progress } from '../../../components/ui/progress';
import { Alert, AlertDescription } from '../../../components/ui/alert';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const { tracks, projectTitle, bpm } = useStudioStore();
  const { studioMode } = useAppTheme();
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportService] = useState(() => new ExportService());
  
  // Apply studio dark mode to document element when dialog is open
  useEffect(() => {
    if (!open) return;
    
    const root = window.document.documentElement;
    const originalHasDark = root.classList.contains('dark');
    
    // Apply or remove dark class based on studioMode immediately
    if (studioMode === 'dark' && !originalHasDark) {
      root.classList.add('dark');
    } else if (studioMode === 'light' && originalHasDark) {
      root.classList.remove('dark');
    }
    
    // Don't restore immediately on cleanup - let the dialog close first
    return () => {
      // We'll handle restoration when dialog fully closes
    };
  }, [open, studioMode]);
  
  // Separate effect to handle restoration after dialog closes
  useEffect(() => {
    if (open) return; // Only run when dialog is closed
    
    // Since we're in the studio, we don't need to restore to UI mode
    // The studio should maintain its own theme consistently
    const timeoutId = setTimeout(() => {
      const root = window.document.documentElement;
      const currentHasDark = root.classList.contains('dark');
      const shouldHaveDark = studioMode === 'dark';
      
      if (shouldHaveDark && !currentHasDark) {
        root.classList.add('dark');
      } else if (!shouldHaveDark && currentHasDark) {
        root.classList.remove('dark');
      }
    }, 200); // Wait for closing animation
    
    return () => clearTimeout(timeoutId);
  }, [open, studioMode]);
  
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
      
      const progressCallback = (progress: ExportProgress) => {
        setExportProgress(progress);
      };
      
      let result: Blob | Map<string, Blob>;
      
      if (exportStems) {
        // Export individual stems
        const stemsOptions: Omit<ExportOptions, 'stems'> = {
          sampleRate,
          bitDepth,
          startTime: 0,
          endTime: projectDuration,
          normalize,
          format,
          bpm
        };
        result = await exportService.exportStems(tracks, stemsOptions, progressCallback);
        
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
        const singleOptions: Omit<ExportOptions, 'format'> = {
          sampleRate,
          bitDepth,
          startTime: 0,
          endTime: projectDuration,
          normalize,
          stems: exportStems,
          bpm
        };
        if (format === 'wav') {
          result = await exportService.exportToWAV(tracks, singleOptions, progressCallback);
        } else {
          // TODO: Implement MP3 and FLAC export
          throw new Error(`${format.toUpperCase()} export not yet implemented`);
        }
        
        // Download the file
        const filename = ExportService.generateFilename(projectTitle || 'project', format);
        ExportService.downloadBlob(result as Blob, filename);
      }
      
      // Success - don't auto-close, let user see the completion message
      
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
    setExportProgress(null); // Reset progress when closing
    onClose();
  }, [isExporting, exportService, onClose]);
  
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setExportProgress(null); // Reset progress when dialog closes
      if (isExporting) {
        exportService.cancel();
      }
      onClose();
    }
  }, [isExporting, exportService, onClose]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Project</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-6 text-foreground">
          {/* Export Settings - Always visible */}
          <div className={isExporting ? "opacity-50 pointer-events-none" : ""}>
            <>
              {/* Format Selection */}
              <div className="space-y-3">
                <Label>Format</Label>
                <RadioGroup 
                  value={format} 
                  onValueChange={(value) => setFormat(value as 'wav' | 'mp3' | 'flac')}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="wav" id="wav" />
                    <Label htmlFor="wav" className="font-normal">
                      WAV (Uncompressed)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="mp3" id="mp3" disabled />
                    <Label htmlFor="mp3" className="font-normal text-muted-foreground">
                      MP3 (Coming soon)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="flac" id="flac" disabled />
                    <Label htmlFor="flac" className="font-normal text-muted-foreground">
                      FLAC (Coming soon)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              
              <div className="h-2"></div>
              
              {/* Sample Rate */}
              <div className="space-y-3">
                <Label>Sample Rate</Label>
                <RadioGroup 
                  value={sampleRate.toString()} 
                  onValueChange={(value) => setSampleRate(parseInt(value) as 44100 | 48000 | 96000)}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="44100" id="sr44100" />
                    <Label htmlFor="sr44100" className="font-normal">
                      44.1 kHz (CD Quality)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="48000" id="sr48000" />
                    <Label htmlFor="sr48000" className="font-normal">
                      48 kHz (Studio Quality)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="96000" id="sr96000" />
                    <Label htmlFor="sr96000" className="font-normal">
                      96 kHz (High Resolution)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              
              {format === 'wav' && <div className="h-2"></div>}
              
              {/* Bit Depth (WAV only) */}
              {format === 'wav' && (
                <div className="space-y-3">
                  <Label>Bit Depth</Label>
                  <RadioGroup 
                    value={bitDepth.toString()} 
                    onValueChange={(value) => setBitDepth(parseInt(value) as 16 | 24 | 32)}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="16" id="bd16" />
                      <Label htmlFor="bd16" className="font-normal">
                        16-bit (CD Quality)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="24" id="bd24" />
                      <Label htmlFor="bd24" className="font-normal">
                        24-bit (Studio Quality)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="32" id="bd32" />
                      <Label htmlFor="bd32" className="font-normal">
                        32-bit Float (Maximum Quality)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
              
              <div className="h-2"></div>
              
              {/* Options */}
              <div className="space-y-4">
                <Label>Options</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="normalize" 
                    checked={normalize}
                    onCheckedChange={(checked) => setNormalize(checked as boolean)}
                  />
                  <Label htmlFor="normalize" className="font-normal">
                    Normalize audio levels
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="stems" 
                    checked={exportStems}
                    onCheckedChange={(checked) => setExportStems(checked as boolean)}
                  />
                  <Label htmlFor="stems" className="font-normal">
                    Export individual tracks (stems)
                  </Label>
                </div>
              </div>
            </>
          </div>
          
          {/* Export Progress - At the bottom */}
          {exportProgress && (
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between text-sm text-foreground">
                <span className="font-medium">{exportProgress.message}</span>
                <span className="font-mono">{exportProgress.percent.toFixed(1)}%</span>
              </div>
              {exportProgress.currentTrack && (
                <p className="text-sm text-muted-foreground">
                  {exportProgress.currentTrack}
                </p>
              )}
              <Progress value={exportProgress.percent} className="w-full mt-2" />
              {exportProgress.stage === 'error' && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>{exportProgress.message}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {isExporting ? 'Cancel' : 'Close'}
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={isExporting}
            className="gap-2"
          >
            {isExporting ? (
              'Exporting...'
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}