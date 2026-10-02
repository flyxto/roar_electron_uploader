import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

async function test() {
  try {
    console.log('Testing ListObjects...');
    const listCmd = new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME, MaxKeys: 1 });
    const listRes = await client.send(listCmd);
    console.log('List Objects Success! Found keys:', listRes.Contents?.map(c => c.Key));

    console.log('\nTesting tiny upload...');
    const putCmd = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: 'test-upload.txt',
      Body: 'Hello World',
      ContentType: 'text/plain'
    });
    await client.send(putCmd);
    console.log('Tiny upload success!');
  } catch (err) {
    console.error('Test failed:', err);
  }
}
test();
