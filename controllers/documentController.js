const mongoose = require('mongoose');
const Document = require('../models/documentModel');
const Employee = require('../models/employeeModel');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../roles');
const {
  getDocumentPath,
  removeDocumentFile,
  validateDocumentSignature
} = require('../utils/documentStorage');
const { processDocumentOcr } = require('../services/documentOcrService');

const privilegedRoles = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, 'hr'];
const employeeAllowedDocumentTypes = ['Aadhar', 'PAN', 'Passport', 'Resume', 'Other'];

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
  getDocuments,
  getDocumentById,
  extractDocumentOcr,
  previewDocumentFile,
  updateDocument,
  deleteDocument
};
