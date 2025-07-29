import React, { useState, useEffect, useCallback } from 'react';
import { Music } from 'lucide-react';
import { AudioTrackRead } from '../../../../platform/types/dto/track_models/audio_track';
import { downloadAudioTrackFile } from '../../../../platform/api/sounds';
import { db } from '../../../core/db/dexie-client';
import { cn } from '@/lib/utils';
import AudioPlayer from '../../shared/AudioPlayer';

interface TrackCardProps {
  track: AudioTrackRead;
  onClick: () => void;
}

const TrackCard: React.FC<TrackCardProps> = ({ track, onClick }) => {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  // Download and cache the audio file
  const downloadAndCacheAudio = useCallback(async () => {
    if (!track.audio_file_storage_key || audioBlob) return;

    setIsDownloading(true);
    try {
      // Check if we already have this file in IndexedDB
      const existingFile = await db.getAudioFile(track.id);
      if (existingFile) {
        setAudioBlob(existingFile.data);
        return;
      }

      // Download from remote storage
      const blob = await downloadAudioTrackFile(track.audio_file_storage_key);
      
      // Store in IndexedDB for future use (upsert to handle existing keys)
      const file = new File([blob], track.name, { type: blob.type });
      await db.upsertAudioFile(track.id, file, track.audio_file_duration);
      
      setAudioBlob(blob);
    } catch (error) {
      console.error('Failed to download audio track:', error);
    } finally {
      setIsDownloading(false);
    }
  }, [track.id, track.audio_file_storage_key, track.name, track.audio_file_duration, audioBlob]);

  // Auto-download when component mounts
  useEffect(() => {
    downloadAndCacheAudio();
  }, [downloadAndCacheAudio]);

  return (
    <div 
      className={cn(
        "rounded-lg overflow-hidden transition-all duration-150 cursor-pointer hover:shadow-md hover:border-primary border bg-card",
        "p-3"
      )}
      onClick={onClick}
    >
      {/* Track Name */}
      <div className="mb-2">
        <h3 className="text-sm font-medium text-foreground truncate">
          {track.name}
        </h3>
      </div>
      
      <div className="flex items-start justify-between mb-2">
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {track.created_at ? new Date(track.created_at).toLocaleDateString() : 'Unknown date'}
            </span>
            {track.audio_file_duration > 0 && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  {formatDuration(track.audio_file_duration)}
                </span>
              </>
            )}
            {track.audio_file_size && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(track.audio_file_size)}
                </span>
              </>
            )}
            
            {/* Format and Sample Rate */}
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
              <Music className="w-2.5 h-2.5 mr-1" />
              {track.audio_file_format?.toUpperCase() || 'AUDIO'}
              {track.audio_file_sample_rate && ` • ${(track.audio_file_sample_rate / 1000).toFixed(0)}kHz`}
            </span>
          </div>
        </div>
      </div>

      {/* AudioPlayer component */}
      <div className="mb-2" onClick={(e) => e.stopPropagation()}>
        {audioBlob ? (
          <AudioPlayer
            audioBlob={audioBlob}
            fileName={`${track.name}.${track.audio_file_format || 'wav'}`}
            className="w-full"
          />
        ) : (
          <div className="w-full h-[80px] flex items-center justify-center bg-muted/20 rounded">
            <span className="text-sm text-muted-foreground">
              {isDownloading ? 'Loading...' : 'Loading audio...'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackCard;