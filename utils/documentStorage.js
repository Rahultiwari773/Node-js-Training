const fs = require('fs');
const path = require('path');

const documentsRoot = path.resolve(__dirname, '..', 'uploads', 'documents');

const ensureDocumentsDirectory = () => {
  fs.mkdirSync(documentsRoot, { recursive: true });
};

const getDocumentPath = (fileName) => {
  if (!fileName || path.basename(fileName) !== fileName) {
    return null;
  }

  return path.join(documentsRoot, fileName);
};

const removeDocumentFile = (fileName) => {
  const filePath = getDocumentPath(fileName);
  if (!filePath) return;

  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

const hasPrefix = (buffer, prefix) => prefix.every((byte, index) => buffer[index] === byte);

const validateDocumentSignature = (filePath, mimeType) => {
  const header = fs.readFileSync(filePath).subarray(0, 12);

  if (mimeType === 'application/pdf') return header.subarray(0, 5).toString() === '%PDF-';
  if (mimeType === 'image/jpeg') return hasPrefix(header, [0xff, 0xd8, 0xff]);
  if (mimeType === 'image/png') return hasPrefix(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return false;
};

module.exports = {
  documentsRoot,
  ensureDocumentsDirectory,
  getDocumentPath,
  removeDocumentFile,
  validateDocumentSignature
};
