const ChunkedUpload = require('../models/chunkedUploadModel');
const { removeChunkDirectory } = require('../utils/chunkedUploadStorage');

const cleanExpiredChunkedUploads = async () => {
  const expiredUploads = await ChunkedUpload.find({ expiresAt: { $lte: new Date() } })
    .select('uploadId');
  await Promise.all(expiredUploads.map((upload) => removeChunkDirectory(upload.uploadId)));
  if (expiredUploads.length) {
    await ChunkedUpload.deleteMany({ _id: { $in: expiredUploads.map((upload) => upload._id) } });
  }
};

const startChunkedUploadCleanup = (intervalMs = 60 * 60 * 1000) => {
  const timer = setInterval(() => {
    cleanExpiredChunkedUploads().catch((error) => {
      console.error('Chunked upload cleanup failed:', error.message);
    });
  }, intervalMs);
  timer.unref();
  return timer;
};

module.exports = { cleanExpiredChunkedUploads, startChunkedUploadCleanup };
