const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const AppError = require('./appError');

const chunkSize = 1024 * 1024;
const chunkedUploadsRoot = path.resolve(__dirname, '..', 'uploads', 'chunks');
const uploadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getChunkDirectory = (uploadId, root = chunkedUploadsRoot) => {
  if (!uploadIdPattern.test(uploadId)) return null;
  return path.join(root, uploadId);
};

const getChunkPath = (uploadId, chunkIndex, root = chunkedUploadsRoot) => {
  const directory = getChunkDirectory(uploadId, root);
  if (!directory || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0) return null;
  return path.join(directory, `${chunkIndex}.part`);
};

const ensureChunkDirectory = async (uploadId, root = chunkedUploadsRoot) => {
  const directory = getChunkDirectory(uploadId, root);
  if (!directory) throw new AppError('Invalid upload ID', 400);
  await fs.promises.mkdir(directory, { recursive: true });
  return directory;
};

const createExactSizeTransform = (expectedBytes) => {
  let receivedBytes = 0;

  return new Transform({
    transform(chunk, encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > expectedBytes) {
        return callback(new AppError('Chunk is larger than expected', 400));
      }
      callback(null, chunk);
    },
    flush(callback) {
      if (receivedBytes !== expectedBytes) {
        return callback(new AppError('Chunk size does not match the expected size', 400));
      }
      callback();
    }
  });
};

const writeChunk = async (source, uploadId, chunkIndex, expectedBytes, root = chunkedUploadsRoot) => {
  const destination = getChunkPath(uploadId, chunkIndex, root);
  if (!destination) throw new AppError('Invalid upload ID or chunk index', 400);

  await ensureChunkDirectory(uploadId, root);
  try {
    await pipeline(
      source,
      createExactSizeTransform(expectedBytes),
      fs.createWriteStream(destination, { flags: 'wx' })
    );
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new AppError('This chunk has already been uploaded', 409);
    }
    await fs.promises.rm(destination, { force: true });
    throw error;
  }
};

const assembleChunks = async (uploadId, totalChunks, destination, root = chunkedUploadsRoot) => {
  const directory = getChunkDirectory(uploadId, root);
  if (!directory) throw new AppError('Invalid upload ID', 400);

  for (let index = 0; index < totalChunks; index += 1) {
    const chunkPath = getChunkPath(uploadId, index, root);
    try {
      await fs.promises.access(chunkPath, fs.constants.R_OK);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new AppError(`Chunk ${index} has not been uploaded`, 400);
      }
      throw error;
    }

    await pipeline(
      fs.createReadStream(chunkPath),
      fs.createWriteStream(destination, { flags: index === 0 ? 'wx' : 'a' })
    );
  }
};

const removeChunkDirectory = async (uploadId, root = chunkedUploadsRoot) => {
  const directory = getChunkDirectory(uploadId, root);
  if (!directory) return;
  await fs.promises.rm(directory, { recursive: true, force: true });
};

module.exports = {
  chunkSize,
  chunkedUploadsRoot,
  getChunkPath,
  createExactSizeTransform,
  writeChunk,
  assembleChunks,
  removeChunkDirectory
};
