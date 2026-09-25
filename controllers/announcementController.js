const Announcement = require('../models/announcementModel');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendMessage } = require('../utils/response');
const { sendAnnouncementEmails } = require('../utils/mailer');
const { ROLES } = require('../roles');

const createAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.create({
    title: req.body.title,
    description: req.body.description,
    createdBy: req.user._id,
    status: req.body.status || 'published'
  });

  if (announcement.status === 'published') {
    const users = await User.find({ email: { $exists: true, $ne: '' } }).select('name email');
    await sendAnnouncementEmails(users, announcement);
  }

  sendSuccess(res, announcement, 201);
});

const getAnnouncements = asyncHandler(async (req, res) => {
  const query = [ROLES.EMPLOYEE, ROLES.MANAGER].includes(req.user.role)
    ? { status: 'published' }
    : {};
  const announcements = await Announcement.find(query).sort({ createdAt: -1 });
  sendSuccess(res, announcements);
});

const getAnnouncementById = asyncHandler(async (req, res) => {
  const query = [ROLES.EMPLOYEE, ROLES.MANAGER].includes(req.user.role)
    ? { _id: req.params.id, status: 'published' }
    : { _id: req.params.id };
  const announcement = await Announcement.findOne(query);

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  sendSuccess(res, announcement);
});

const updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  announcement.title = req.body.title || announcement.title;
  announcement.description = req.body.description || announcement.description;
  announcement.status = req.body.status || announcement.status;
  await announcement.save();

  sendSuccess(res, announcement, 200);
});

const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  await announcement.deleteOne();
  sendMessage(res, 'Announcement deleted successfully', 200);
});

module.exports = {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement
};
