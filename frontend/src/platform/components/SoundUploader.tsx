import React, { useState } from 'react';
import { CloudUpload, X } from 'lucide-react';
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Progress } from "../../components/ui/progress";
import { getUploadUrl, createSoundRecord } from '../api/sounds';
import { processAudioFile as processAudioFileUtil, uploadFileWithProgress } from '../../studio/utils/audioProcessing';

interface SoundUploaderProps {
  onSoundUploaded?: (soundId: string) => void;
  onCancel?: () => void;
}

export default function SoundUploader({ onSoundUploaded, onCancel }: SoundUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [soundName, setSoundName] = useState('');

  const processAudioFile = async (file: File) => {
    const metadata = await processAudioFileUtil(file);
    return metadata;
  };
  

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    // Default name from file name without extension
    setSoundName(selectedFile.name.split('.')[0]);
  };
  
  const handleUpload = async () => {
    if (!file || !soundName) return;
    
    setUploading(true);
    setProgress(0);
    setError(null);
    
    try {
      // 1. Generate UUID and get presigned URL
      const trackId = crypto.randomUUID();
      const { id, upload_url, storage_key } = await getUploadUrl(file.name, trackId, 'audio');
      
      // 2. Upload file with progress tracking
      await uploadFileWithProgress(
        file, 
        upload_url,
        (percent) => setProgress(percent)
      );
      
      // 3. Process file to get metadata
      const metadata = await processAudioFile(file);
      
      // 4. Create database record
      await createSoundRecord({
        id: id,
        name: soundName,
        audio_file_format: metadata.format,
        audio_file_duration: metadata.duration,
        audio_file_size: file.size,
        audio_file_sample_rate: metadata.sampleRate,
        audio_file_storage_key: storage_key,
        waveform_data: metadata.waveform
      });
      
      // 5. Call success callback
      if (onSoundUploaded) {
        onSoundUploaded(id);
      }
      
      // Reset state
      setFile(null);
      setSoundName('');
      setProgress(0);
    } catch (err) {
      setError('Upload failed: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <Card className="p-3 border border-border bg-card relative">
      <CardHeader className="p-0 pb-4">
        {onCancel && (
          <Button 
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 h-8 w-8 p-0"
            onClick={onCancel}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
        
        <h3 className="text-lg font-semibold">
          Upload Sound
        </h3>
      </CardHeader>
      
      <CardContent className="p-0 space-y-4">
        <div>
          <input
            accept="audio/*"
            style={{ display: 'none' }}
            id="sound-file-input"
            type="file"
            onChange={handleFileSelected}
            disabled={uploading}
          />
          <label htmlFor="sound-file-input">
            <Button 
              variant="outline" 
              asChild
              disabled={uploading}
              className="cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <CloudUpload className="w-4 h-4" />
                Select Audio File
              </span>
            </Button>
          </label>
          {file && (
            <p className="text-sm text-muted-foreground mt-2">
              Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
            </p>
          )}
        </div>
        
        {file && (
          <div>
            <Input
              placeholder="Sound Name"
              value={soundName}
              onChange={(e) => setSoundName(e.target.value)}
              disabled={uploading}
            />
          </div>
        )}
        
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {uploading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">
                {progress < 100 ? `Uploading: ${progress}%` : 'Processing...'}
              </span>
            </div>
            {progress < 100 && (
              <Progress value={progress} className="w-full" />
            )}
          </div>
        )}
        
        <Button
          onClick={handleUpload}
          disabled={!file || !soundName || uploading}
          className="w-full bg-primary hover:bg-primary/90"
        >
          Upload Sound
        </Button>
      </CardContent>
    </Card>
  );
}