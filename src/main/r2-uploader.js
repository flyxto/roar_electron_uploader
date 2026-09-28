import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs'
import { basename } from 'path'

let _s3Client = null

function getClient(settings) {
  // Always recreate if settings changed
  _s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${settings.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: settings.r2AccessKeyId,
      secretAccessKey: settings.r2SecretAccessKey
    }
  })
  return _s3Client
}

/**
 * Upload a file to Cloudflare R2
 * @param {string} filePath - Local path to file
 * @param {string} key - Object key (path) in R2 bucket
 * @param {object} settings - R2 settings
 * @returns {Promise<string>} - Public URL
 */
export async function uploadToR2(filePath, key, settings) {
  const client = getClient(settings)
  const fileBuffer = fs.readFileSync(filePath)
  const fileName = basename(filePath)

  const command = new PutObjectCommand({
    Bucket: settings.r2BucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: 'video/mp4'
  })

  await client.send(command)

  // Return public URL
  const publicUrl = settings.r2PublicUrl.replace(/\/$/, '')
  return `${publicUrl}/${key}`
}
