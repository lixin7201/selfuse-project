import { v4 as uuidv4 } from 'uuid';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { respData, respErr } from '@/shared/lib/resp';
import { getAllConfigs } from '@/shared/models/config';

/**
 * 获取预签名上传 URL
 * 让客户端直接上传到 R2/S3，绕过 Vercel 的 4.5MB 限制
 */
export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json();

    if (!filename) {
      return respErr('Filename is required');
    }

    const configs = await getAllConfigs();

    // 检查 R2 配置
    if (
      !configs.r2_access_key ||
      !configs.r2_secret_key ||
      !configs.r2_bucket_name
    ) {
      return respErr('Storage not configured');
    }

    // 创建 S3 客户端（R2 兼容 S3 API）
    const accountId = configs.r2_account_id || '';
    const endpoint =
      configs.r2_endpoint || `https://${accountId}.r2.cloudflarestorage.com`;

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: configs.r2_access_key,
        secretAccessKey: configs.r2_secret_key,
      },
    });

    // 生成唯一的文件 key
    const ext = filename.split('.').pop() || 'bin';
    const uploadPath = configs.r2_upload_path || '';
    const key = `${uploadPath ? uploadPath + '/' : ''}chat/${Date.now()}-${uuidv4()}.${ext}`;

    // 创建预签名 URL（有效期 10 分钟）
    const command = new PutObjectCommand({
      Bucket: configs.r2_bucket_name,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 600, // 10 分钟
    });

    // 构建公开访问 URL
    const publicDomain = configs.r2_domain;
    const publicUrl = publicDomain
      ? `${publicDomain.replace(/\/$/, '')}/${key}`
      : `${endpoint}/${configs.r2_bucket_name}/${key}`;

    console.log('[Presigned URL API] Generated presigned URL for:', {
      filename,
      key,
      contentType,
    });

    return respData({
      presignedUrl,
      publicUrl,
      key,
    });
  } catch (e) {
    console.error('[Presigned URL API] Error:', e);
    return respErr('Failed to generate presigned URL');
  }
}
