const mongoose = require('mongoose');

const documentTypes = [
  'Aadhar',
  'PAN',
  'Passport',
  'Resume',
  'Offer Letter',
  'Joining Letter',
  'Experience Letter',
  'Salary Slip',
  'Other'
];

const documentSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true
    },
    documentType: {
      type: String,
      enum: documentTypes,
      required: true,
      trim: true,
      index: true
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255
    },
    fileName: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    filePath: {
      type: String,
      required: true,
      select: false
    },
    fileSize: {
      type: Number,
      required: true,
      min: 1
    },
    mimeType: {
      type: String,
      enum: ['application/pdf', 'image/jpeg', 'image/png'],
      required: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true
    },
    ocrText: {
      type: String,
      default: '',
      select: false
    },
    ocrStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'not_supported'],
      default: 'pending',
      index: true
    },
    ocrConfidence: {
      type: Number,
      default: null,
      min: 0,
      max: 100
    },
    ocrProcessedAt: {
      type: Date,
      default: null
    },
    ocrError: {
      type: String,
      default: '',
      select: false
    },
    ocrFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    collection: 'documents'
  }
);

module.exports = mongoose.model('Document', documentSchema);
module.exports.documentTypes = documentTypes;
