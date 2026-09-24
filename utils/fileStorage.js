const fs = require('fs');
const path = require('path');

const uploadsRoot = path.resolve(__dirname, '..', 'uploads', 'employee-files');

const ensureUploadDirectory = () => {
  fs.mkdirSync(uploadsRoot, { recursive: true });
};

const getStoredFilePath = (storedName) => {
  if (!storedName || path.basename(storedName) !== storedName) {
    return null;
  }

  return path.join(uploadsRoot, storedName);
};

const deleteStoredFile = (storedName) => {
  const filePath = getStoredFilePath(storedName);
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const hasPrefix = (buffer, prefix) => prefix.every((byte, index) => buffer[index] === byte);

const validateFileSignature = (filePath, mimeType, extension) => {
  const fileHeader = fs.readFileSync(filePath).subarray(0, 12);

  if (mimeType === 'application/pdf') {
    return fileHeader.subarray(0, 5).toString() === '%PDF-';
  }

  if (mimeType === 'image/jpeg') {
    return hasPrefix(fileHeader, [0xff, 0xd8, 0xff]);
  }

  if (mimeType === 'image/png') {
    return hasPrefix(fileHeader, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  if (mimeType === 'image/webp') {
    return fileHeader.subarray(0, 4).toString() === 'RIFF'
      && fileHeader.subarray(8, 12).toString() === 'WEBP';
  }

  if (mimeType === 'image/gif') {
    const signature = fileHeader.subarray(0, 6).toString();
    return signature === 'GIF87a' || signature === 'GIF89a';
  }

  if (mimeType === 'application/msword') {
    return hasPrefix(fileHeader, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }

  if (extension === '.docx' || extension === '.xlsx') {
    return hasPrefix(fileHeader, [0x50, 0x4b, 0x03, 0x04]);
  }

  return false;
};

module.exports = {
  uploadsRoot,
  ensureUploadDirectory,
  getStoredFilePath,
  deleteStoredFile,
  validateFileSignature
};