const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const {
  writeChunk,
  assembleChunks,
  getChunkPath,
  removeChunkDirectory
} = require('../utils/chunkedUploadStorage');

describe('chunked upload storage', () => {
  let root;
  let uploadId;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'chunked-upload-test-'));
    uploadId = crypto.randomUUID();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  test('writes streamed chunks and assembles them in order', async () => {
    const firstChunk = Buffer.from('first-');
    const secondChunk = Buffer.from('second');
    const destination = path.join(root, 'assembled.pdf');

    await writeChunk(Readable.from([firstChunk]), uploadId, 0, firstChunk.length, root);
    await writeChunk(Readable.from([secondChunk]), uploadId, 1, secondChunk.length, root);
    await assembleChunks(uploadId, 2, destination, root);

    await expect(fs.readFile(destination)).resolves.toEqual(Buffer.concat([firstChunk, secondChunk]));
  });

  test('rejects a chunk with a mismatched byte count and removes partial data', async () => {
    await expect(
      writeChunk(Readable.from([Buffer.from('short')]), uploadId, 0, 10, root)
    ).rejects.toThrow('Chunk size does not match the expected size');

    await expect(fs.access(getChunkPath(uploadId, 0, root))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('does not overwrite or remove an already received chunk', async () => {
    const original = Buffer.from('original');
    await writeChunk(Readable.from([original]), uploadId, 0, original.length, root);

    await expect(
      writeChunk(Readable.from([Buffer.from('replacement')]), uploadId, 0, 11, root)
    ).rejects.toThrow('This chunk has already been uploaded');
    await expect(fs.readFile(getChunkPath(uploadId, 0, root))).resolves.toEqual(original);
  });

  test('removes only the matching upload directory', async () => {
    await writeChunk(Readable.from([Buffer.from('one')]), uploadId, 0, 3, root);

    await removeChunkDirectory(uploadId, root);

    await expect(fs.access(path.join(root, uploadId))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
