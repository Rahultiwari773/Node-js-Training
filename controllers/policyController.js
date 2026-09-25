const Policy = require('../models/policyModel');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendMessage } = require('../utils/response');

const createPolicy = asyncHandler(async (req, res) => {
  const policy = await Policy.create({
    title: req.body.title,
    description: req.body.description,
    createdBy: req.user._id,
    status: req.body.status || 'published'
  });

  sendSuccess(res, policy, 201);
});

const getPolicies = asyncHandler(async (req, res) => {
  const policies = await Policy.find().sort({ createdAt: -1 });
  sendSuccess(res, policies);
});

const getPolicyById = asyncHandler(async (req, res) => {
  const policy = await Policy.findById(req.params.id);

  if (!policy) {
    throw new AppError('Policy not found', 404);
  }

  sendSuccess(res, policy);
});

const updatePolicy = asyncHandler(async (req, res) => {
  const policy = await Policy.findById(req.params.id);

  if (!policy) {
    throw new AppError('Policy not found', 404);
  }

  policy.title = req.body.title || policy.title;
  policy.description = req.body.description || policy.description;
  policy.status = req.body.status || policy.status;
  await policy.save();

  sendSuccess(res, policy, 200);
});

const deletePolicy = asyncHandler(async (req, res) => {
  const policy = await Policy.findById(req.params.id);

  if (!policy) {
    throw new AppError('Policy not found', 404);
  }

  await policy.deleteOne();
  sendMessage(res, 'Policy deleted successfully', 200);
});

module.exports = {
  createPolicy,
  getPolicies,
  getPolicyById,
  updatePolicy,
  deletePolicy
};
