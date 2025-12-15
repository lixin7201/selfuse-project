import { v4 as uuidv4 } from 'uuid';

import { respData, respErr } from '@/shared/lib/resp';
import { getStorageService } from '@/shared/services/storage';

// 支持的文件类型
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];
const ALLOWED_TEXT_EXTENSIONS = [
  '.txt',
  '.md',
  '.json',
  '.csv',
  '.xml',
  '.html',
  '.css',
  '.js',
  '.ts',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
];

function isTextFile(file: File): boolean {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
  return ALLOWED_TEXT_EXTENSIONS.includes(ext);
}

function isImageFile(file: File): boolean {
  return ALLOWED_IMAGE_TYPES.includes(file.type);
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    console.log('[Upload API] Received files:', files.length);
    files.forEach((file, i) => {
      console.log(`[Upload API] File ${i}:`, {
        name: file.name,
        type: file.type,
        size: file.size,
      });
    });

    if (!files || files.length === 0) {
      return respErr('No files provided');
    }

    const uploadResults = [];

    for (const file of files) {
      const isImage = isImageFile(file);
      const isText = isTextFile(file);
      const isPdf = isPdfFile(file);

      if (!isImage && !isText && !isPdf) {
        return respErr(`Unsupported file type: ${file.type || file.name}`);
      }

      // 读取文件内容
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const result: {
        filename: string;
        type: string;
        url?: string;
        key?: string;
        text?: string;
        base64?: string;
        mimeType?: string;
      } = {
        filename: file.name,
        type: file.type || 'application/octet-stream',
      };

      if (isImage) {
        // 图片上传到存储
        const ext = file.name.split('.').pop();
        const key = `chat/${Date.now()}-${uuidv4()}.${ext}`;

        const storageService = await getStorageService();
        const uploadResult = await storageService.uploadFile({
          body: buffer,
          key: key,
          contentType: file.type,
          disposition: 'inline',
        });

        if (!uploadResult.success) {
          console.error('[Upload API] Upload failed:', uploadResult.error);
          return respErr(uploadResult.error || 'Upload failed');
        }

        console.log('[Upload API] Image upload success:', uploadResult.url);
        result.url = uploadResult.url;
        result.key = uploadResult.key;
      } else if (isPdf) {
        // PDF 文件：上传到存储并返回 base64（用于 Gemini）
        const ext = 'pdf';
        const key = `chat/${Date.now()}-${uuidv4()}.${ext}`;

        const storageService = await getStorageService();
        const uploadResult = await storageService.uploadFile({
          body: buffer,
          key: key,
          contentType: 'application/pdf',
          disposition: 'inline',
        });

        if (!uploadResult.success) {
          console.error('[Upload API] PDF upload failed:', uploadResult.error);
          return respErr(uploadResult.error || 'Upload failed');
        }

        console.log('[Upload API] PDF upload success:', uploadResult.url);
        result.url = uploadResult.url;
        result.key = uploadResult.key;
        // 同时提供 base64 以便 Gemini 模型直接处理
        result.base64 = buffer.toString('base64');
        result.mimeType = 'application/pdf';
      } else {
        // 文本文件读取内容
        result.text = buffer.toString('utf-8');
        console.log('[Upload API] Text file read, length:', result.text.length);
      }

      uploadResults.push(result);
    }

    console.log('[Upload API] All uploads complete. Results:', uploadResults.length);

    return respData({ results: uploadResults });
  } catch (e) {
    console.error('upload file failed:', e);
    return respErr('upload file failed');
  }
}
