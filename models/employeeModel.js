const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    department: {
      type: String,
      required: true,
      trim: true
    },
    salary: {
      type: Number,
      required: true,
      min: 0
    },
    role : {
      type: String,
      required: true,
      trim: true
    },
    files: [{
      originalName: {
        type: String,
        required: true,
        trim: true
      },
      storedName: {
        type: String,
        required: true,
        select: false
      },
      mimeType: {
        type: String,
        required: true
      },
      size: {
        type: Number,
        required: true,
        min: 1
      },
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  {
    timestamps: true,
    collection: 'employees'
  }
);

module.exports = mongoose.model('Employee', employeeSchema);