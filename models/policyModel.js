const mongoose = require('mongoose');

const policySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'published'
    }
  },
  {
    timestamps: true,
    collection: 'policies'
  }
);

module.exports = mongoose.model('Policy', policySchema);
