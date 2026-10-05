const mongoose = require('mongoose');
const Employee = require('../models/employeeModel');
const AppError = require('../utils/appError');
const { redisClient } = require('../utils/redisClient');
const {
  deleteStoredFile,
  getStoredFilePath,
  validateFileSignature
} = require('../utils/fileStorage');

const validateId = (id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid employee ID', 400);
  }
};

const canAccessAllEmployees = (user) => ['super_admin', 'admin', 'hr_manager', 'hr'].includes(user.role);

const EMPLOYEE_LIST_CACHE_PREFIX = 'employees:list:';
const EMPLOYEE_LIST_CACHE_TTL_SECONDS = 60;

const getEmployeeListCacheKey = (user) => (
  canAccessAllEmployees(user)
    ? `${EMPLOYEE_LIST_CACHE_PREFIX}all`
    : `${EMPLOYEE_LIST_CACHE_PREFIX}user:${encodeURIComponent(String(user.email || '').toLowerCase())}`
);

const invalidateEmployeeListCache = async () => {
  if (!redisClient.isReady) return;

  try {
    for await (const page of redisClient.scanIterator({
      MATCH: `${EMPLOYEE_LIST_CACHE_PREFIX}*`,
      COUNT: 100
    })) {
      const keys = Array.isArray(page) ? page : [page];
      if (keys.length) await redisClient.del(keys);
    }
  } catch (error) {
    console.error('Employee cache invalidation failed:', error.message);
  }
};

const employeeAccessFilter = (user) => (canAccessAllEmployees(user)
  ? {}
  : { email: user.email });

const getEmployees = async (user) => {
  const cacheKey = getEmployeeListCacheKey(user);

  if (redisClient.isReady) {
    try {
      const cachedEmployees = await redisClient.get(cacheKey);
      if (cachedEmployees !== null) {
        console.log(`Employee cache HIT: ${cacheKey}`);
        return JSON.parse(cachedEmployees);
      }
    } catch (error) {
      console.error('Employee cache read failed:', error.message);
    }
  }

  console.log(`Employee cache MISS: ${cacheKey}`);
  const employees = await Employee.find(employeeAccessFilter(user)).sort({ createdAt: -1 });

  if (redisClient.isReady) {
    try {
      await redisClient.set(
        cacheKey,
        JSON.stringify(employees),
        { EX: EMPLOYEE_LIST_CACHE_TTL_SECONDS }
      );
    } catch (error) {
      console.error('Employee cache write failed:', error.message);
    }
  }

  return employees;
};

const getEmployeeById = async (id, user) => {
  validateId(id);
  const employee = await Employee.findOne({ _id: id, ...employeeAccessFilter(user) });

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  return employee;
};

const createEmployee = async (data, user) => {
  const employeeData = { ...data, createdBy: user._id };
  delete employeeData.files;
  const employee = await Employee.create(employeeData);
  await invalidateEmployeeListCache();
  return employee;
};

const updateEmployee = async (id, data, user) => {
  validateId(id);
  const employeeData = { ...data };
  delete employeeData.createdBy;
  delete employeeData.files;

  const employee = await Employee.findOneAndUpdate(
    { _id: id, ...employeeAccessFilter(user) },
    employeeData,
    {
    new: true,
    runValidators: true
    }
  );

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  await invalidateEmployeeListCache();
  return employee;
};

const deleteEmployee = async (id, user) => {
  validateId(id);
  const employee = await Employee.findOneAndDelete({
    _id: id,
    ...employeeAccessFilter(user)
  });

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  await invalidateEmployeeListCache();
  employee.files.forEach((file) => deleteStoredFile(file.storedName));
};

const getAccessibleEmployee = async (id, user) => {
  validateId(id);
  const employee = await Employee.findOne({ _id: id, ...employeeAccessFilter(user) })
    .select('+files.storedName');

  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  return employee;
};

const addEmployeeFile = async (id, user, file) => {
  if (!file) {
    throw new AppError('A file is required', 400);
  }

  const extension = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
  if (!validateFileSignature(file.path, file.mimetype, extension)) {
    deleteStoredFile(file.filename);
    throw new AppError('The file content does not match an allowed document type', 400);
  }

  const employee = await getAccessibleEmployee(id, user);
  employee.files.push({
    originalName: file.originalname,
    storedName: file.filename,
    mimeType: file.mimetype,
    size: file.size,
    uploadedBy: user._id
  });

  try {
    await employee.save();
  } catch (error) {
    deleteStoredFile(file.filename);
    throw error;
  }

  await invalidateEmployeeListCache();

  const uploadedFile = employee.files[employee.files.length - 1];
  return {
    id: uploadedFile._id,
    originalName: uploadedFile.originalName,
    mimeType: uploadedFile.mimeType,
    size: uploadedFile.size,
    uploadedAt: uploadedFile.uploadedAt
  };
};

const listEmployeeFiles = async (id, user) => {
  const employee = await getAccessibleEmployee(id, user);

  return employee.files.map((file) => ({
    id: file._id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    uploadedBy: file.uploadedBy,
    uploadedAt: file.uploadedAt
  }));
};

const getEmployeeFile = async (id, fileId, user) => {
  const employee = await getAccessibleEmployee(id, user);
  const file = employee.files.id(fileId);

  if (!file) {
    throw new AppError('File not found', 404);
  }

  return { file, filePath: getStoredFilePath(file.storedName) };
};

const deleteEmployeeFile = async (id, fileId, user) => {
  const employee = await getAccessibleEmployee(id, user);
  const file = employee.files.id(fileId);

  if (!file) {
    throw new AppError('File not found', 404);
  }

  const storedName = file.storedName;
  file.deleteOne();
  await employee.save();
  await invalidateEmployeeListCache();
  deleteStoredFile(storedName);
};

const seedDefaultEmployees = async () => {
  const defaultEmployees = [
    {
      name: 'John Doe',
      email: 'john.doe@example.com',
      department: 'IT',
      role: 'Developer',
      salary: 60000
    },
    {
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
      department: 'HR',
      role: 'Manager',
      salary: 55000
    }
  ];

  for (const employee of defaultEmployees) {
    await Employee.updateOne(
      { email: employee.email },
      {
        $set: {
          name: employee.name,
          department: employee.department,
          role: employee.role,
          salary: employee.salary
        },
        $setOnInsert: { email: employee.email }
      },
      { upsert: true }
    );
  }
};

module.exports = {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  addEmployeeFile,
  listEmployeeFiles,
  getEmployeeFile,
  deleteEmployeeFile,
  seedDefaultEmployees
};
