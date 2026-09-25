const Leave = require('../models/leaveModel');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendMessage } = require('../utils/response');
const { ROLES } = require('../roles');

const buildLeaveQuery = (req) => {
  const query = {};

  if (req.user.role === ROLES.EMPLOYEE) {
    query.$or = [
      { employeeId: req.user._id },
      { createdBy: req.user._id }
    ];
  }

  return query;
};

const createLeave = asyncHandler(async (req, res) => {
  const payload = {
    employeeId: req.user._id,
    createdBy: req.user._id,
    leaveType: req.body.leaveType,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    reason: req.body.reason,
    status: 'pending'
  };

  const leave = await Leave.create(payload);
  sendSuccess(res, leave, 201);
});

const updateLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);

  if (!leave) {
    throw new AppError('Leave not found', 404);
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    const isOwner = leave.employeeId.toString() === req.user._id.toString()
      || leave.createdBy.toString() === req.user._id.toString();

    if (!isOwner || leave.status !== 'pending') {
      throw new AppError('Only your pending leave can be updated', 403);
    }
  }

  const allowedFields = ['leaveType', 'startDate', 'endDate', 'reason'];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      leave[field] = req.body[field];
    }
  });

  if (req.user.role !== ROLES.EMPLOYEE && req.body.status) {
    leave.status = req.body.status;
  }

  await leave.save();
  sendSuccess(res, leave, 200);
});

const getLeaves = asyncHandler(async (req, res) => {
  const leaves = await Leave.find(buildLeaveQuery(req)).sort({ createdAt: -1 });
  sendSuccess(res, leaves);
});

const getLeaveById = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);

  if (!leave) {
    throw new AppError('Leave not found', 404);
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    const isOwner = leave.employeeId.toString() === req.user._id.toString()
      || leave.createdBy.toString() === req.user._id.toString();

    if (!isOwner) {
      throw new AppError('Access denied', 403);
    }
  }

  sendSuccess(res, leave);
});

const approveLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);

  if (!leave) {
    throw new AppError('Leave not found', 404);
  }

  if (leave.employeeId.toString() === req.user._id.toString()) {
    throw new AppError('Employees cannot approve their own leave', 403);
  }

  if (leave.status !== 'pending') {
    throw new AppError('Only pending leave can be approved', 400);
  }

  leave.status = 'approved';
  leave.approvedBy = req.user._id;
  await leave.save();

  sendSuccess(res, leave, 200);
});

const rejectLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);

  if (!leave) {
    throw new AppError('Leave not found', 404);
  }

  if (leave.employeeId.toString() === req.user._id.toString()) {
    throw new AppError('Employees cannot reject their own leave', 403);
  }

  if (leave.status !== 'pending') {
    throw new AppError('Only pending leave can be rejected', 400);
  }

  leave.status = 'rejected';
  leave.approvedBy = req.user._id;
  await leave.save();

  sendSuccess(res, leave, 200);
});

const deleteLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);

  if (!leave) {
    throw new AppError('Leave not found', 404);
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    const isOwner = leave.employeeId.toString() === req.user._id.toString()
      || leave.createdBy.toString() === req.user._id.toString();

    if (!isOwner || leave.status !== 'pending') {
      throw new AppError('Only your pending leave can be deleted', 403);
    }
  }

  await leave.deleteOne();
  sendMessage(res, 'Leave deleted successfully', 200);
});

module.exports = {
  createLeave,
  updateLeave,
  getLeaves,
  getLeaveById,
  approveLeave,
  rejectLeave,
  deleteLeave
};
