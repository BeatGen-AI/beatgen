/**
 * Base class for all export engines
 */

import { 
  ExportProgress, 
  ExportProgressCallback, 
  ExportError,
  ExportErrorCode,
  RenderResult,
  ExportOptions
} from './types';
import { CombinedTrack } from '../../../platform/types/project';

export abstract class BaseExportEngine {
  protected cancelled = false;
  protected progressCallback?: ExportProgressCallback;
  
  constructor(progressCallback?: ExportProgressCallback) {
    this.progressCallback = progressCallback;
  }
  
  cancel() {
    this.cancelled = true;
  }
  
  protected updateProgress(progress: ExportProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
  
  protected checkCancelled() {
    if (this.cancelled) {
      throw new ExportError('Export cancelled by user', ExportErrorCode.CANCELLED_BY_USER);
    }
  }
  
  abstract renderTrack(track: CombinedTrack, options: ExportOptions): Promise<RenderResult>;
}