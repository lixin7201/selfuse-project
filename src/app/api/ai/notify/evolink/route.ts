import { saveFiles } from '@/extensions/ai';
import { AIFile, AITaskStatus } from '@/extensions/ai';
import {
  findAITaskByProviderTaskId,
  updateAITaskById,
  UpdateAITask,
} from '@/shared/models/ai_task';
import { getAllConfigs } from '@/shared/models/config';

/**
 * Evolink AI webhook notification handler
 * Receives task completion notifications from Evolink API
 * 
 * Callback format per docs:
 * - Same as task query response
 * - Triggered on: completed, failed, cancelled
 * 
 * @docs https://docs.evolink.ai/cn/api-manual/
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    // Parse webhook payload (format is same as task query response)
    const payload = JSON.parse(rawBody);

    const taskId = payload.id;
    const status = payload.status;

    if (!taskId) {
      console.error('Evolink webhook: missing task id');
      return Response.json(
        { message: 'Missing task id' },
        { status: 400 }
      );
    }

    // Find the task by provider task ID
    const task = await findAITaskByProviderTaskId(taskId, 'evolink');
    if (!task) {
      console.error(`Evolink webhook: task not found for taskId: ${taskId}`);
      return Response.json(
        { message: 'Task not found' },
        { status: 404 }
      );
    }

    // Map Evolink status to AITaskStatus
    let taskStatus: AITaskStatus;
    switch (status?.toLowerCase()) {
      case 'pending':
        taskStatus = AITaskStatus.PENDING;
        break;
      case 'processing':
        taskStatus = AITaskStatus.PROCESSING;
        break;
      case 'completed':
        taskStatus = AITaskStatus.SUCCESS;
        break;
      case 'failed':
        taskStatus = AITaskStatus.FAILED;
        break;
      case 'cancelled':
      case 'canceled':
        taskStatus = AITaskStatus.CANCELED;
        break;
      default:
        taskStatus = AITaskStatus.PROCESSING;
    }

    // Build task info from webhook payload
    const taskInfo: any = {
      status: status,
      errorCode: payload.error?.code || '',
      errorMessage: payload.error?.message || '',
    };

    // Extract output data if task succeeded
    // Results are in "results" array per docs
    if (taskStatus === AITaskStatus.SUCCESS && payload.results) {
      const results: string[] = payload.results;
      const isVideo = payload.type === 'video';

      // Get configs to check if custom storage is enabled
      const configs = await getAllConfigs();
      const useCustomStorage = configs.evolink_custom_storage === 'true';

      if (isVideo) {
        taskInfo.videos = results.map((url: string) => ({
          id: '',
          createTime: new Date(),
          videoUrl: url,
        }));

        // Upload to custom storage if enabled
        if (useCustomStorage && taskInfo.videos.length > 0) {
          const filesToSave: AIFile[] = taskInfo.videos.map((video: any, index: number) => ({
            url: video.videoUrl,
            contentType: 'video/mp4',
            key: `evolink/video/${Date.now()}-${index}.mp4`,
            index: index,
            type: 'video',
          }));

          const uploadedFiles = await saveFiles(filesToSave);
          if (uploadedFiles) {
            uploadedFiles.forEach((file: AIFile) => {
              if (file && file.url && file.index !== undefined && taskInfo.videos[file.index]) {
                taskInfo.videos[file.index].videoUrl = file.url;
              }
            });
          }
        }
      } else {
        taskInfo.images = results.map((url: string) => ({
          id: '',
          createTime: new Date(),
          imageUrl: url,
        }));

        // Upload to custom storage if enabled
        if (useCustomStorage && taskInfo.images.length > 0) {
          const filesToSave: AIFile[] = taskInfo.images.map((image: any, index: number) => ({
            url: image.imageUrl,
            contentType: 'image/png',
            key: `evolink/image/${Date.now()}-${index}.png`,
            index: index,
            type: 'image',
          }));

          const uploadedFiles = await saveFiles(filesToSave);
          if (uploadedFiles) {
            uploadedFiles.forEach((file: AIFile) => {
              if (file && file.url && file.index !== undefined && taskInfo.images[file.index]) {
                taskInfo.images[file.index].imageUrl = file.url;
              }
            });
          }
        }
      }
    }

    // Update the task in database
    const updateData: UpdateAITask = {
      status: taskStatus,
      taskInfo: JSON.stringify(taskInfo),
      taskResult: rawBody,
      creditId: task.creditId, // Keep credit ID for potential refund on failure
    };

    await updateAITaskById(task.id, updateData);

    console.log(`Evolink webhook: updated task ${task.id} to status ${taskStatus}`);

    return Response.json({
      message: 'success',
    });
  } catch (err: any) {
    console.error('Evolink webhook handler failed:', err);
    return Response.json(
      { message: `Webhook handler failed: ${err.message}` },
      { status: 500 }
    );
  }
}
