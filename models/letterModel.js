const mongoose = require('mongoose');

const letterSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    letterType: {
      type: String,
      enum: ['experience', 'joining', 'relieving', 'salary', 'promotion', 'warning', 'appraisal'],
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['draft', 'generated', 'archived'],
      default: 'generated'
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'letters'
  }
);

module.exports = mongoose.model('Letter', letterSchema);
