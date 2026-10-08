const mongoose = require('mongoose');

const chunkedUploadSchema = new mongoose.Schema(
  {
    uploadId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    documentType: {
      type: String,
      required: true
    },
    originalFileName: {
      type: String,
      required: true,
      maxlength: 255
    },
    mimeType: {
      type: String,
      enum: ['application/pdf', 'image/jpeg', 'image/png'],
      required: true
    },
    fileSize: {
      type: Number,
      required: true,
      min: 1
    },
    totalChunks: {
      type: Number,
      required: true,
      min: 1
    },
    receivedChunks: {
      type: [Number],
      default: []
    },
    status: {
      type: String,
      enum: ['uploading', 'assembling'],
      default: 'uploading'
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'chunked_uploads'
  }
);

module.exports = mongoose.model('ChunkedUpload', chunkedUploadSchema);
