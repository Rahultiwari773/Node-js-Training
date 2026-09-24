const employeeService = require('../services/employeeService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendMessage } = require('../utils/response');
const { createFilePreviewToken } = require('../utils/token');

const getFileUrls = (req, employeeId, fileId) => ({
  previewUrl: `${req.protocol}://${req.get('host')}${req.baseUrl}/${employeeId}/files/${fileId}/preview?accessToken=${createFilePreviewToken(req.user, employeeId, fileId)}`,
  downloadUrl: `${req.protocol}://${req.get('host')}${req.baseUrl}/${employeeId}/files/${fileId}?accessToken=${createFilePreviewToken(req.user, employeeId, fileId)}`
});

const getEmployees = asyncHandler(async (req, res) => {
  const employees = await employeeService.getEmployees(req.user);
  sendSuccess(res, employees);
});

const getEmployeeById = asyncHandler(async (req, res) => {
  const employee = await employeeService.getEmployeeById(req.params.id, req.user);
  sendSuccess(res, employee);
});

const createEmployee = asyncHandler(async (req, res) => {
  const employee = await employeeService.createEmployee(req.body, req.user);
  sendSuccess(res, employee, 201);
});

const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await employeeService.updateEmployee(
    req.params.id,
    req.body,
    req.user
  );
  sendSuccess(res, employee);
});

const deleteEmployee = asyncHandler(async (req, res) => {
  await employeeService.deleteEmployee(req.params.id, req.user);
  sendMessage(res, 'Employee deleted successfully');
});

const uploadFile = asyncHandler(async (req, res) => {
  const file = await employeeService.addEmployeeFile(req.params.id, req.user, req.file);
  sendSuccess(res, { ...file, ...getFileUrls(req, req.params.id, file.id) }, 201);
});

const listFiles = asyncHandler(async (req, res) => {
  const files = await employeeService.listEmployeeFiles(req.params.id, req.user);
  sendSuccess(res, files.map((file) => ({
    ...file,
    ...getFileUrls(req, req.params.id, file.id)
  })));
});

const downloadFile = asyncHandler(async (req, res) => {
  const { file, filePath } = await employeeService.getEmployeeFile(
    req.params.id,
    req.params.fileId,
    req.user
  );
  res.download(filePath, file.originalName);
});

const previewFile = asyncHandler(async (req, res) => {
  const { file, filePath } = await employeeService.getEmployeeFile(
    req.params.id,
    req.params.fileId,
    req.user
  );
  const safeName = file.originalName.replace(/[\r\n"\\]/g, '_');

  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.sendFile(filePath);
});

const deleteFile = asyncHandler(async (req, res) => {
  await employeeService.deleteEmployeeFile(req.params.id, req.params.fileId, req.user);
  sendMessage(res, 'File deleted successfully');
});

module.exports = {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  uploadFile,
  listFiles,
  downloadFile,
  previewFile,
  deleteFile
};