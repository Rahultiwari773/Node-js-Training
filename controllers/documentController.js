const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Document = require('../models/documentModel');
const ChunkedUpload = require('../models/chunkedUploadModel');
const Employee = require('../models/employeeModel');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../roles');
const {
  documentsRoot,
  ensureDocumentsDirectory,
  getDocumentPath,
  removeDocumentFile,
  validateDocumentSignature
} = require('../utils/documentStorage');
const { processDocumentOcr } = require('../services/documentOcrService');
const {
  chunkSize,
  chunkedUploadsRoot,
  getChunkPath,
  writeChunk,
  assembleChunks,
  removeChunkDirectory
} = require('../utils/chunkedUploadStorage');
const { cleanExpiredChunkedUploads } = require('../services/chunkedUploadCleanup');

const privilegedRoles = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, 'hr'];
const employeeAllowedDocumentTypes = ['Aadhar', 'PAN', 'Passport', 'Resume', 'Other'];
const uploadMimeExtensions = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png']
]);
const chunkedUploadLifetimeMs = 24 * 60 * 60 * 1000;

const toPublicDocument = (document) => {
  const value = document.toObject ? document.toObject() : document;
  delete value.filePath;
  delete value.ocrError;
  delete value.__v;
  return value;
};

const validateObjectId = (value, message) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new AppError(message, 400);
  }
};

const getAccessibleEmployee = async (employeeId, user) => {
  validateObjectId(employeeId, 'Invalid employeeId');
  const employee = await Employee.findById(employeeId);

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  if (privilegedRoles.includes(user.role)) {
    return employee;
  }

  if (user.role === ROLES.EMPLOYEE) {
    if (employee.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppError('Access denied', 403);
    }
    return employee;
  }

  if (user.role === ROLES.MANAGER) {
    const managerEmployee = await Employee.findOne({ email: user.email }).select('department');
    const userDepartment = user.department || user.team || managerEmployee?.department;
    const isPermittedTeam = userDepartment && employee.department.toLowerCase() === String(userDepartment).toLowerCase();
    const createdByManager = employee.createdBy && employee.createdBy.toString() === user._id.toString();

    if (!isPermittedTeam && !createdByManager) {
      throw new AppError('Access denied', 403);
    }
    return employee;
  }

  throw new AppError('Access denied', 403);
};

const getEmployeeIdsForUser = async (user) => {
  if (privilegedRoles.includes(user.role)) return null;

  if (user.role === ROLES.EMPLOYEE) {
    const employee = await Employee.findOne({ email: user.email }).select('_id');
    return employee ? [employee._id] : [];
  }

  if (user.role === ROLES.MANAGER) {
    const managerEmployee = await Employee.findOne({ email: user.email }).select('department');
    const userDepartment = user.department || user.team || managerEmployee?.department;
    const teamQuery = user.department || user.team
      ? { department: userDepartment }
      : managerEmployee?.department
      ? { department: managerEmployee.department }
      : { createdBy: user._id };
    const employees = await Employee.find(teamQuery).select('_id');
    return employees.map((employee) => employee._id);
  }

  return [];
};

const validateUploadedFile = (file) => {
  if (!file) {
    throw new AppError('A file is required', 400);
  }

  const isValidSignature = validateDocumentSignature(file.path, file.mimetype);
  if (!isValidSignature) {
    removeDocumentFile(file.filename);
    throw new AppError('File content does not match the declared PDF or image type', 400);
  }
};

const getOwnedChunkedUpload = async (uploadId, userId) => {
  const upload = await ChunkedUpload.findOne({ uploadId, userId });
  if (!upload) throw new AppError('Upload session not found', 404);
  if (upload.expiresAt <= new Date()) {
    await removeChunkDirectory(upload.uploadId);
    await upload.deleteOne();
    throw new AppError('Upload session has expired', 410);
  }
  return upload;
};

const initiateChunkedDocumentUpload = asyncHandler(async (req, res) => {
  const {
    employeeId,
    documentType,
    originalFileName,
    mimeType,
    fileSize
  } = req.body;

  const safeFileName = path.win32.basename(path.posix.basename(originalFileName));
  const expectedExtension = uploadMimeExtensions.get(mimeType);
  if (!expectedExtension || path.extname(safeFileName).toLowerCase() !== expectedExtension
    && !(mimeType === 'image/jpeg' && path.extname(safeFileName).toLowerCase() === '.jpeg')) {
    throw new AppError('File name extension must match the declared PDF or image type', 400);
  }

  const employee = await getAccessibleEmployee(employeeId, req.user);
  if (req.user.role === ROLES.EMPLOYEE && !employeeAllowedDocumentTypes.includes(documentType)) {
    throw new AppError('Employees can upload only personal identity and resume documents', 403);
  }

  await cleanExpiredChunkedUploads();

  const uploadId = crypto.randomUUID();
  const totalChunks = Math.ceil(fileSize / chunkSize);
  const upload = await ChunkedUpload.create({
    uploadId,
    userId: req.user._id,
    employeeId: employee._id,
    documentType,
    originalFileName: safeFileName,
    mimeType,
    fileSize,
    totalChunks,
    expiresAt: new Date(Date.now() + chunkedUploadLifetimeMs)
  });

  try {
    await fs.promises.mkdir(path.join(chunkedUploadsRoot, uploadId), { recursive: true });
  } catch (error) {
    await upload.deleteOne();
    throw error;
  }

  res.status(201).json({
    success: true,
    message: 'Chunked upload initialized',
    data: { uploadId, chunkSize, totalChunks, expiresAt: upload.expiresAt }
  });
});

const uploadDocumentChunk = asyncHandler(async (req, res) => {
  if (!req.is('application/octet-stream')) {
    throw new AppError('Chunk content type must be application/octet-stream', 415);
  }

  const upload = await getOwnedChunkedUpload(req.params.uploadId, req.user._id);
  if (upload.status !== 'uploading') throw new AppError('Upload session is being finalized', 409);
  if (!/^(0|[1-9]\d*)$/.test(req.params.chunkIndex)) {
    throw new AppError('Invalid chunk index', 400);
  }

  const chunkIndex = Number(req.params.chunkIndex);
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex >= upload.totalChunks) {
    throw new AppError('Chunk index is outside this upload', 400);
  }
  if (upload.receivedChunks.includes(chunkIndex)) {
    throw new AppError('This chunk has already been uploaded', 409);
  }

  const expectedBytes = Math.min(chunkSize, upload.fileSize - chunkIndex * chunkSize);
  if (req.headers['content-length'] !== undefined
    && Number(req.headers['content-length']) !== expectedBytes) {
    throw new AppError('Chunk size does not match the expected size', 400);
  }

  await writeChunk(req, upload.uploadId, chunkIndex, expectedBytes);

  const updatedUpload = await ChunkedUpload.findOneAndUpdate(
    {
      _id: upload._id,
      status: 'uploading',
      receivedChunks: { $ne: chunkIndex }
    },
    { $addToSet: { receivedChunks: chunkIndex } },
    { new: true }
  );

  if (!updatedUpload) {
    await fs.promises.rm(getChunkPath(upload.uploadId, chunkIndex), { force: true });
    throw new AppError('Upload session is no longer accepting chunks', 409);
  }

  res.json({
    success: true,
    message: 'Chunk uploaded',
    data: {
      uploadId: upload.uploadId,
      receivedChunks: updatedUpload.receivedChunks.length,
      totalChunks: updatedUpload.totalChunks
    }
  });
});

const completeChunkedDocumentUpload = asyncHandler(async (req, res) => {
  const currentUpload = await getOwnedChunkedUpload(req.params.uploadId, req.user._id);
  if (currentUpload.status !== 'uploading') {
    throw new AppError('Upload session is already being finalized', 409);
  }
  if (currentUpload.receivedChunks.length !== currentUpload.totalChunks) {
    const missingChunks = Array.from(
      { length: currentUpload.totalChunks },
      (_, index) => index
    ).filter((index) => !currentUpload.receivedChunks.includes(index));
    throw new AppError('Upload is incomplete', 400, missingChunks.map((index) => ({
      chunkIndex: index
    })));
  }

  const upload = await ChunkedUpload.findOneAndUpdate(
    { _id: currentUpload._id, status: 'uploading' },
    {
      $set: {
        status: 'assembling',
        expiresAt: new Date(Date.now() + chunkedUploadLifetimeMs)
      }
    },
    { new: true }
  );
  if (!upload) throw new AppError('Upload session is already being finalized', 409);

  const filename = `${crypto.randomUUID()}${uploadMimeExtensions.get(upload.mimeType)}`;
  const filePath = path.join(documentsRoot, filename);
  ensureDocumentsDirectory();
  let documentCreated = false;

  try {
    await assembleChunks(upload.uploadId, upload.totalChunks, filePath);
    const file = {
      filename,
      path: filePath,
      originalname: upload.originalFileName,
      mimetype: upload.mimeType,
      size: upload.fileSize
    };
    await validateUploadedFile(file);
    const employee = await getAccessibleEmployee(upload.employeeId, req.user);

    const document = await Document.create({
      employeeId: employee._id,
      documentType: upload.documentType,
      originalFileName: upload.originalFileName,
      fileName: filename,
      filePath: filename,
      fileSize: upload.fileSize,
      mimeType: upload.mimeType,
      uploadedBy: req.user._id,
      status: 'active'
    });
    documentCreated = true;
    await processDocumentOcr(document);
    await removeChunkDirectory(upload.uploadId);
    await upload.deleteOne();

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: toPublicDocument(document)
    });
  } catch (error) {
    if (!documentCreated) removeDocumentFile(filename);
    if (documentCreated) {
      await removeChunkDirectory(upload.uploadId);
      await upload.deleteOne();
    } else {
      await ChunkedUpload.updateOne({ _id: upload._id }, { $set: { status: 'uploading' } });
    }
    throw error;
  }
});

const cancelChunkedDocumentUpload = asyncHandler(async (req, res) => {
  const upload = await getOwnedChunkedUpload(req.params.uploadId, req.user._id);
  if (upload.status !== 'uploading') {
    throw new AppError('Upload session is being finalized', 409);
  }

  await removeChunkDirectory(upload.uploadId);
  await upload.deleteOne();
  res.json({ success: true, message: 'Upload cancelled' });
});

const buildDocumentQuery = async (req) => {
  const query = {};
  const { employeeId, documentType, status, search } = req.query;

  if (employeeId) {
    await getAccessibleEmployee(employeeId, req.user);
    query.employeeId = employeeId;
  } else {
    const employeeIds = await getEmployeeIdsForUser(req.user);
    if (employeeIds) query.employeeId = { $in: employeeIds };
  }

  if (documentType) query.documentType = documentType;
  if (status) query.status = status;
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.originalFileName = { $regex: escapedSearch, $options: 'i' };
  }

  return query;
};

const uploadDocumentFile = asyncHandler(async (req, res) => {
  const { employeeId, documentType } = req.body || {};
  const file = req.file;

  try {
    validateUploadedFile(file);
    const employee = await getAccessibleEmployee(employeeId, req.user);

    if (req.user.role === ROLES.EMPLOYEE && !employeeAllowedDocumentTypes.includes(documentType)) {
      throw new AppError('Employees can upload only personal identity and resume documents', 403);
    }

    const document = await Document.create({
      employeeId: employee._id,
      documentType,
      originalFileName: file.originalname,
      fileName: file.filename,
      filePath: file.filename,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploadedBy: req.user._id,
      status: 'active'
    });
    await processDocumentOcr(document);

    return res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: toPublicDocument(document)
    });
  } catch (error) {
    if (file) removeDocumentFile(file.filename);
    throw error;
  }
});

const getDocuments = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const query = await buildDocumentQuery(req);
  const [documents, total] = await Promise.all([
    Document.find(query).select('+ocrText').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Document.countDocuments(query)
  ]);

  res.json({
    success: true,
    data: documents.map(toPublicDocument),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

const getDocumentById = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, 'Invalid document ID');
  const document = await Document.findById(req.params.id).select('+filePath +ocrText +ocrError');

  if (!document) {
    throw new AppError('Document not found', 404);
  }

  await getAccessibleEmployee(document.employeeId, req.user);
  res.json({ success: true, data: toPublicDocument(document) });
});

const extractDocumentOcr = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, 'Invalid document ID');
  const document = await Document.findById(req.params.id).select('+filePath +ocrText +ocrError');

  if (!document) {
    throw new AppError('Document not found', 404);
  }

  await getAccessibleEmployee(document.employeeId, req.user);
  await processDocumentOcr(document);

  res.json({
    success: true,
    message: document.ocrStatus === 'completed'
      ? 'Document text extracted successfully'
      : 'Document OCR completed with limited support',
    data: toPublicDocument(document)
  });
});

const previewDocumentFile = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, 'Invalid document ID');
  const document = await Document.findById(req.params.id).select('+filePath');

  if (!document) {
    throw new AppError('Document not found', 404);
  }

  await getAccessibleEmployee(document.employeeId, req.user);
  const filePath = getDocumentPath(document.fileName);
  if (!filePath) throw new AppError('Stored document path is invalid', 404);

  const safeName = document.originalFileName.replace(/[\r\n"\\]/g, '_');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.type(document.mimeType);
  res.sendFile(filePath);
});

const updateDocument = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, 'Invalid document ID');
  const document = await Document.findById(req.params.id).select('+filePath');

  if (!document) {
    throw new AppError('Document not found', 404);
  }

  await getAccessibleEmployee(document.employeeId, req.user);
  const newFile = req.file;
  const oldFileName = document.fileName;

  try {
    if (newFile) {
      validateUploadedFile(newFile);
      document.originalFileName = newFile.originalname;
      document.fileName = newFile.filename;
      document.filePath = newFile.filename;
      document.fileSize = newFile.size;
      document.mimeType = newFile.mimetype;
    }

    if (req.body.documentType !== undefined) {
      if (req.user.role === ROLES.EMPLOYEE && !employeeAllowedDocumentTypes.includes(req.body.documentType)) {
        throw new AppError('Employees can upload only personal identity and resume documents', 403);
      }
      document.documentType = req.body.documentType;
    }
    if (req.body.status !== undefined) document.status = req.body.status;
    await document.save();

    if (newFile && oldFileName !== newFile.filename) removeDocumentFile(oldFileName);
    res.json({ success: true, message: 'Document updated successfully', data: toPublicDocument(document) });
  } catch (error) {
    if (newFile) removeDocumentFile(newFile.filename);
    throw error;
  }
});

const deleteDocument = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, 'Invalid document ID');
  const document = await Document.findById(req.params.id).select('+filePath');

  if (!document) {
    throw new AppError('Document not found', 404);
  }

  await getAccessibleEmployee(document.employeeId, req.user);
  await document.deleteOne();
  removeDocumentFile(document.fileName);

  res.json({ success: true, message: 'Document deleted successfully' });
});

module.exports = {
  uploadDocumentFile,
  initiateChunkedDocumentUpload,
  uploadDocumentChunk,
  completeChunkedDocumentUpload,
  cancelChunkedDocumentUpload,
  getDocuments,
  getDocumentById,
  extractDocumentOcr,
  previewDocumentFile,
  updateDocument,
  deleteDocument
};
