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

// 支持的文本文件扩展名
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
  '.sh',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.log',
];

function getFileExtension(filename: string): string {
  return '.' + (filename.split('.').pop()?.toLowerCase() || '');
}

function isTextFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return ALLOWED_TEXT_EXTENSIONS.includes(ext);
}

function isImageFile(file: File): boolean {
  return ALLOWED_IMAGE_TYPES.includes(file.type);
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isWordFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return ext === '.docx' || ext === '.doc' || 
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.type === 'application/msword';
}

function isExcelFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return ext === '.xlsx' || ext === '.xls' ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel';
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
      const isWord = isWordFile(file);
      const isExcel = isExcelFile(file);

      // 读取文件内容
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const result: {
        filename: string;
        type: string;
        fileType: 'image' | 'text' | 'pdf' | 'word' | 'excel' | 'unknown';
        url?: string;
        key?: string;
        text?: string;
        base64?: string;
        mimeType?: string;
      } = {
        filename: file.name,
        type: file.type || 'application/octet-stream',
        fileType: 'unknown',
      };

      if (isImage) {
        // 图片上传到存储
        result.fileType = 'image';
        try {
          const ext = file.name.split('.').pop();
          const key = `chat/${Date.now()}-${uuidv4()}.${ext}`;

          const storageService = await getStorageService();
          const uploadResult = await storageService.uploadFile({
            body: buffer,
            key: key,
            contentType: file.type,
            disposition: 'inline',
          });

          if (uploadResult.success) {
            console.log('[Upload API] Image upload success:', uploadResult.url);
            result.url = uploadResult.url;
            result.key = uploadResult.key;
          } else {
            // 如果上传失败，返回 base64 作为备选
            console.warn('[Upload API] Image upload failed, using base64 fallback');
            result.base64 = buffer.toString('base64');
            result.mimeType = file.type;
          }
        } catch (e) {
          console.error('[Upload API] Image upload error:', e);
          // 上传失败，返回 base64
          result.base64 = buffer.toString('base64');
          result.mimeType = file.type;
        }
      } else if (isText) {
        // 文本文件直接读取内容
        result.fileType = 'text';
        result.text = buffer.toString('utf-8');
        console.log('[Upload API] Text file read, length:', result.text.length);
      } else if (isPdf) {
        // PDF 文件返回 base64（用于 Gemini 原生处理）
        result.fileType = 'pdf';
        result.base64 = buffer.toString('base64');
        result.mimeType = 'application/pdf';
        console.log('[Upload API] PDF file encoded, size:', result.base64.length);
      } else if (isWord) {
        // Word 文件暂时返回 base64，提示用户转换为其他格式
        result.fileType = 'word';
        result.text = `[Word 文件: ${file.name}]\n\n注意：Word 文档解析需要额外配置。建议将文档导出为 PDF 或纯文本格式后上传。`;
        console.log('[Upload API] Word file detected:', file.name);
      } else if (isExcel) {
        // Excel 文件暂时返回提示
        result.fileType = 'excel';
        result.text = `[Excel 文件: ${file.name}]\n\n注意：Excel 文档解析需要额外配置。建议将表格导出为 CSV 格式后上传。`;
        console.log('[Upload API] Excel file detected:', file.name);
      } else {
        // 其他文件尝试作为文本读取
        result.fileType = 'unknown';
        try {
          result.text = buffer.toString('utf-8');
          console.log('[Upload API] Unknown file type, tried as text:', file.name);
        } catch (e) {
          result.text = `[不支持的文件类型: ${file.name}]`;
        }
      }

      uploadResults.push(result);
    }

    console.log('[Upload API] All uploads complete. Results:', uploadResults.length);

    return respData({ results: uploadResults });
  } catch (e) {
    console.error('[Upload API] Error:', e);
    return respErr('upload file failed');
  }
}
