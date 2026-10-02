import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED'
});

async function test() {
  const filePath = '/Users/ravindusankalpa/Desktop/flyxto/Reels_proceed/1108_processed.mp4';
  const key = 'reels/1108_processed.mp4';
  
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: 'video/mp4'
  });
  
  const signedUrl = await getSignedUrl(client, command, { expiresIn: 900 });
  console.log('Got signed URL. Uploading via cURL...');
  
  const curl = spawn('curl', [
    '-v',
    '-s',
    '-w', '\\nHTTP_CODE:%{http_code}',
    '-X', 'PUT',
    '-T', filePath,
    '-H', 'Content-Type: video/mp4',
    '-H', 'Expect:',
    signedUrl
  ]);

  curl.stdout.on('data', d => console.log('STDOUT:', d.toString()));
  curl.stderr.on('data', d => console.log('STDERR:', d.toString()));
  
  curl.on('close', code => console.log('cURL exited with code:', code));
}
test();
