import React, { useRef } from 'react';
import { Upload } from 'lucide-react';

interface FileUploadPanelProps {
  onFileUpload?: (file: File) => void;
}

const FileUploadPanel: React.FC<FileUploadPanelProps> = ({ onFileUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && onFileUpload) {
      // Handle multiple files
      Array.from(files).forEach((file) => {
        onFileUpload(file);
      });
      
      // Clear the input so the same files can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-grow overflow-y-auto p-6">
        <div className="space-y-6">
          <div className="text-center">
            <Upload className="w-12 h-12 mx-auto mb-3 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Upload Audio</h3>
            <p className="text-sm text-muted-foreground">
              Add audio files to your library
            </p>
          </div>

          {/* File Upload Area */}
          <div className="border-2 h-80 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors flex items-center justify-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="audio-upload"
            />
            <label
              htmlFor="audio-upload"
              className="cursor-pointer flex flex-col items-center gap-4"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Choose files or drag and drop
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports MP3, WAV, FLAC, and other audio formats
                </p>
              </div>
            </label>
          </div>

          {/* Help Text */}
          <div className="bg-muted/30 rounded-lg p-4">
            <h4 className="font-medium mb-2">Tips for uploading:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Use high-quality audio files for best results</li>
              <li>• Supported formats: MP3, WAV, FLAC, OGG, M4A</li>
              <li>• Files will be added to your audio library</li>
              <li>• You can then add them to studio projects</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUploadPanel;