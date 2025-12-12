import { getUuid } from '@/shared/lib/hash';

import { saveFiles } from '.';
import {
  AIConfigs,
  AIFile,
  AIGenerateParams,
  AIImage,
  AIMediaType,
  AIProvider,
  AITaskResult,
  AITaskStatus,
  AIVideo,
} from './types';

/**
 * Evolink AI configs
 * @docs https://docs.evolink.ai/cn/api-manual/
 */
export interface EvolinkConfigs extends AIConfigs {
  apiKey: string;
  baseUrl?: string;
  customStorage?: boolean; // use custom storage to save files
}

/**
 * Evolink AI provider
 * @docs https://docs.evolink.ai/cn/api-manual/
 * 
 * Supported endpoints:
 * - Image: POST /v1/images/generations
 * - Video: POST /v1/videos/generations
 * - Task Query: GET /v1/tasks/{task_id}
 */
export class EvolinkProvider implements AIProvider {
  // provider name
  readonly name = 'evolink';
  // provider configs
  configs: EvolinkConfigs;

  // default api base url
  private baseUrl = 'https://api.evolink.ai';

  // init provider
  constructor(configs: EvolinkConfigs) {
    this.configs = configs;
    if (configs.baseUrl) {
      this.baseUrl = configs.baseUrl;
    }
  }

  // generate task
  async generate({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    const { mediaType, model, prompt, options, callbackUrl } = params;

    if (!mediaType) {
      throw new Error('mediaType is required');
    }

    if (!model) {
      throw new Error('model is required');
    }

    if (!prompt && !options) {
      throw new Error('prompt or options is required');
    }

    // determine endpoint based on media type
    let endpoint: string;
    if (mediaType === AIMediaType.VIDEO) {
      endpoint = '/v1/videos/generations';
    } else if (mediaType === AIMediaType.IMAGE) {
      endpoint = '/v1/images/generations';
    } else {
      throw new Error(`Unsupported media type: ${mediaType}`);
    }

    // build request params based on official API docs
    const requestBody = this.formatGenerateInput({
      mediaType,
      model,
      prompt,
      options,
    });

    // add callback url if valid
    const isValidCallbackUrl =
      callbackUrl &&
      callbackUrl.startsWith('https') &&
      !callbackUrl.includes('localhost') &&
      !callbackUrl.includes('127.0.0.1');

    if (isValidCallbackUrl) {
      requestBody.callback_url = callbackUrl;
    }

    const apiUrl = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.configs.apiKey}`,
    };

    console.log('evolink generate request:', apiUrl, JSON.stringify(requestBody, null, 2));

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(
        `Evolink request failed with status: ${resp.status}, message: ${errorText}`
      );
    }

    const data = await resp.json();

    // Evolink returns task ID in "id" field
    if (!data || !data.id) {
      throw new Error('Evolink generate failed: no id in response');
    }

    return {
      taskStatus: this.mapStatus(data.status || 'pending'),
      taskId: data.id,
      taskInfo: {
        status: data.status,
      },
      taskResult: data,
    };
  }

  // query task
  async query({
    taskId,
    model,
    mediaType,
  }: {
    taskId: string;
    model?: string;
    mediaType?: AIMediaType;
  }): Promise<AITaskResult> {
    // GET /v1/tasks/{task_id}
    const queryUrl = `${this.baseUrl}/v1/tasks/${taskId}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.configs.apiKey}`,
    };

    const resp = await fetch(queryUrl, {
      method: 'GET',
      headers,
    });

    if (!resp.ok) {
      throw new Error(`Evolink query failed with status: ${resp.status}`);
    }

    const data = await resp.json();
    const taskStatus = this.mapStatus(data.status);

    // if task is not completed, return status only
    if (taskStatus !== AITaskStatus.SUCCESS) {
      return {
        taskId,
        taskStatus,
        taskInfo: {
          status: data.status,
          errorCode: data.error?.code || '',
          errorMessage: data.error?.message || '',
        },
        taskResult: data,
      };
    }

    let images: AIImage[] | undefined = undefined;
    let videos: AIVideo[] | undefined = undefined;

    // Evolink returns results in "results" array
    const results = data.results || [];

    if (data.type === 'video' || mediaType === AIMediaType.VIDEO) {
      // handle video output
      videos = results.map((url: string) => ({
        id: '',
        createTime: new Date(),
        videoUrl: url,
      }));
    } else {
      // handle image output (default)
      images = results.map((url: string) => ({
        id: '',
        createTime: new Date(),
        imageUrl: url,
      }));
    }

    // save files to custom storage
    if (taskStatus === AITaskStatus.SUCCESS && this.configs.customStorage) {
      // save images
      if (images && images.length > 0) {
        const filesToSave: AIFile[] = [];
        images.forEach((image, index) => {
          if (image.imageUrl) {
            filesToSave.push({
              url: image.imageUrl,
              contentType: 'image/png',
              key: `evolink/image/${getUuid()}.png`,
              index: index,
              type: 'image',
            });
          }
        });

        if (filesToSave.length > 0) {
          const uploadedFiles = await saveFiles(filesToSave);
          if (uploadedFiles) {
            uploadedFiles.forEach((file: AIFile) => {
              if (file && file.url && images && file.index !== undefined) {
                const image = images[file.index];
                if (image) {
                  image.imageUrl = file.url;
                }
              }
            });
          }
        }
      }

      // save videos
      if (videos && videos.length > 0) {
        const filesToSave: AIFile[] = [];
        videos.forEach((video, index) => {
          if (video.videoUrl) {
            filesToSave.push({
              url: video.videoUrl,
              contentType: 'video/mp4',
              key: `evolink/video/${getUuid()}.mp4`,
              index: index,
              type: 'video',
            });
          }
        });

        if (filesToSave.length > 0) {
          const uploadedFiles = await saveFiles(filesToSave);
          if (uploadedFiles) {
            uploadedFiles.forEach((file: AIFile) => {
              if (file && file.url && videos && file.index !== undefined) {
                const video = videos[file.index];
                if (video) {
                  video.videoUrl = file.url;
                }
              }
            });
          }
        }
      }
    }

    return {
      taskId,
      taskStatus,
      taskInfo: {
        images,
        videos,
        status: data.status,
        errorCode: '',
        errorMessage: '',
        createTime: new Date(),
      },
      taskResult: data,
    };
  }

  // map Evolink status to AITaskStatus
  private mapStatus(status: string): AITaskStatus {
    switch (status?.toLowerCase()) {
      case 'pending':
        return AITaskStatus.PENDING;
      case 'processing':
        return AITaskStatus.PROCESSING;
      case 'completed':
        return AITaskStatus.SUCCESS;
      case 'failed':
        return AITaskStatus.FAILED;
      case 'cancelled':
      case 'canceled':
        return AITaskStatus.CANCELED;
      default:
        return AITaskStatus.PROCESSING;
    }
  }

  // format input for image/video generation per Evolink API docs
  private formatGenerateInput({
    mediaType,
    model,
    prompt,
    options,
  }: {
    mediaType: AIMediaType;
    model: string;
    prompt: string;
    options: any;
  }): any {
    const input: any = {
      model,
    };

    if (prompt) {
      input.prompt = prompt;
    }

    if (!options) {
      return input;
    }

    // handle image generation options
    if (mediaType === AIMediaType.IMAGE) {
      // size parameter (e.g., \"1:1\", \"16:9\", \"1024x768\")
      // Also accept aspect_ratio as an alias for size (for compatibility with frontend)
      if (options.size) {
        input.size = options.size;
      } else if (options.aspect_ratio) {
        input.size = options.aspect_ratio;
      }
      // seed for reproducibility
      if (options.seed) {
        input.seed = options.seed;
      }
      // nsfw check
      if (options.nsfw_check !== undefined) {
        input.nsfw_check = options.nsfw_check;
      }
      // image_input -> image_urls for image-to-image (Nano Banana Pro, etc.)
      if (options.image_input && Array.isArray(options.image_input)) {
        input.image_urls = options.image_input;
      }
    }

    // handle video generation options
    if (mediaType === AIMediaType.VIDEO) {
      // aspect ratio (e.g., "16:9", "9:16")
      if (options.aspect_ratio) {
        input.aspect_ratio = options.aspect_ratio;
      }
      // generation type: TEXT, FIRST&LAST, REFERENCE
      if (options.generation_type) {
        input.generation_type = options.generation_type;
      }
      // image_input -> image_urls for video generation
      if (options.image_input && Array.isArray(options.image_input)) {
        input.image_urls = options.image_input;
      }
    }

    return input;
  }
}
