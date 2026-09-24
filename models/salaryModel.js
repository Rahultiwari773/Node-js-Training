const mongoose = require('mongoose');

const salarySchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      unique: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    basicSalary: {
      type: Number,
      min: 0,
      default: 0
    },
    allowances: {
      type: Number,
      min: 0,
      default: 0
    },
    deductions: {
      type: Number,
      min: 0,
      default: 0
    },
    bonus: {
      type: Number,
      min: 0,
      default: 0
    },
    overtimePay: {
      type: Number,
      min: 0,
      default: 0
    },
    payPeriod: {
      type: String,
      enum: ['monthly', 'weekly', 'daily', 'yearly'],
      default: 'monthly'
    },
    paymentDate: {
      type: Date
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'cancelled'],
      default: 'pending'
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500
    }
  },
  {
    timestamps: true,
    collection: 'salaries'
  }
);

module.exports = mongoose.model('Salary', salarySchema);
