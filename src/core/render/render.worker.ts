/**
 * RENDER WORKER - Executes in Web Worker thread
 * Handles video encoding without blocking main UI thread
 */

import { videoExportService } from '../export/videoExportService';

interface RenderMessage {
  type: 'render';
  task: {
    id: string;
    projectId: string;
    clipIndex: number;
    totalClips: number;
    plan: any;
  };
}

self.addEventListener('message', async (event: MessageEvent<RenderMessage>) => {
  if (event.data.type !== 'render') return;

  const { task } = event.data;

  try {
    // Notify start
    self.postMessage({
      type: 'progress',
      taskId: task.id,
      data: {
        percent: 0,
        message: `Rendering clip ${task.clipIndex + 1}/${task.totalClips}...`
      }
    });

    // Execute render with progress callback
    const result = await videoExportService.startExport(task.plan, (progress) => {
      self.postMessage({
        type: 'progress',
        taskId: task.id,
        data: {
          percent: progress.percent,
          message: progress.statusMessage || `Rendering: ${progress.percent}%`
        }
      });
    });

    // Send complete with blob
    self.postMessage({
      type: 'complete',
      taskId: task.id,
      data: {
        blob: result.blob,
        fileName: result.fileName,
        duration: result.duration,
        width: result.width,
        height: result.height
      }
    });
  } catch (error: any) {
    self.postMessage({
      type: 'error',
      taskId: task.id,
      error: error?.message || 'Unknown render error'
    });
  }
});
