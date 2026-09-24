const mongoose = require('mongoose');
const Salary = require('../models/salaryModel');
const Employee = require('../models/employeeModel');
const AppError = require('../utils/appError');

const employeeFields = 'name email department role';

const validateSalaryId = (id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid salary ID', 400);
  }
};

const canAccessAllSalaries = (user) => ['admin', 'hr'].includes(user.role);

const getSalaryAccessFilter = async (user) => {
  if (canAccessAllSalaries(user)) {
    return {};
  }

  const employees = await Employee.find({ email: user.email }).select('_id');
  return { employeeId: { $in: employees.map((employee) => employee._id) } };
};

const validateEmployee = async (employeeId, user) => {
  if (!mongoose.isValidObjectId(employeeId)
    || !(await Employee.exists({
      _id: employeeId,
      ...(canAccessAllSalaries(user) ? {} : { email: user.email })
    }))) {
    throw new AppError('Employee not found. Salary was not changed.', 404);
  }
};

const getSalaries = async (user) => Salary.find(await getSalaryAccessFilter(user))
  .populate('employeeId', employeeFields)
  .sort({ createdAt: -1 });

const getSalaryById = async (id, user) => {
  validateSalaryId(id);
  const salary = await Salary.findOne({
    _id: id,
    ...(await getSalaryAccessFilter(user))
  })
    .populate('employeeId', employeeFields);

  if (!salary) {
    throw new AppError('Salary not found', 404);
  }

  return salary;
};

const createSalary = async (data, user) => {
  await validateEmployee(data.employeeId, user);
  const salary = await Salary.create({ ...data, createdBy: user._id });
  return salary.populate('employeeId', employeeFields);
};

const updateSalary = async (id, data, user) => {
  validateSalaryId(id);

  if (data.employeeId !== undefined) {
    await validateEmployee(data.employeeId, user);
  }

  const salaryData = { ...data };
  delete salaryData.createdBy;

  const salary = await Salary.findOneAndUpdate(
    { _id: id, ...(await getSalaryAccessFilter(user)) },
    salaryData,
    {
    new: true,
    runValidators: true
    }
  ).populate('employeeId', employeeFields);

  if (!salary) {
    throw new AppError('Salary not found', 404);
  }

  return salary;
};

const deleteSalary = async (id, user) => {
  validateSalaryId(id);
  const salary = await Salary.findOneAndDelete({
    _id: id,
    ...(await getSalaryAccessFilter(user))
  });

  if (!salary) {
    throw new AppError('Salary not found', 404);
  }
};

module.exports = {
  getSalaries,
  getSalaryById,
  createSalary,
  updateSalary,
  deleteSalary
};
