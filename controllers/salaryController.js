const salaryService = require('../services/salaryService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendMessage } = require('../utils/response');

const getSalaries = asyncHandler(async (req, res) => {
  const salaries = await salaryService.getSalaries(req.user);
  sendSuccess(res, salaries);
});

const getSalaryById = asyncHandler(async (req, res) => {
  const salary = await salaryService.getSalaryById(req.params.id, req.user);
  sendSuccess(res, salary);
});

const createSalary = asyncHandler(async (req, res) => {
  const salary = await salaryService.createSalary(req.body, req.user);
  sendSuccess(res, salary, 201);
});

const updateSalary = asyncHandler(async (req, res) => {
  const salary = await salaryService.updateSalary(req.params.id, req.body, req.user);
  sendSuccess(res, salary);
});

const deleteSalary = asyncHandler(async (req, res) => {
  await salaryService.deleteSalary(req.params.id, req.user);
  sendMessage(res, 'Salary deleted successfully');
});

module.exports = {
  getSalaries,
  getSalaryById,
  createSalary,
  updateSalary,
  deleteSalary
};
