const Letter = require('../models/letterModel');
const Employee = require('../models/employeeModel');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendMessage } = require('../utils/response');
const { sendLetterEmail } = require('../utils/mailer');
const { ROLES } = require('../roles');

const allowableLetterTypes = ['experience', 'joining', 'relieving', 'salary', 'promotion', 'warning', 'appraisal'];
const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const findLetterRecipient = async (employeeId, employee) => {
  if (employee?.email) {
    return employee;
  }

  return User.findById(employeeId).select('name email');
};

const buildLetterTemplate = (employee, letterType, title, customContent = '') => {
  const dateText = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const employeeName = employee?.name || 'Employee';
  const department = employee?.department || 'the organization';
  const role = employee?.role || 'employee';
  const email = employee?.email || 'N/A';

  const templates = {
    experience: `
      <p>To whom it may concern,</p>
      <p>This is to certify that <strong>${employeeName}</strong> has been working with our organization in the <strong>${department}</strong> department as <strong>${role}</strong> from the date of joining until the present.</p>
      <p>During this period, the employee has shown dedication, professionalism, and good conduct in their assigned responsibilities. We are pleased to confirm their contribution and commitment to the company.</p>
      <p>We wish them all the very best in their future endeavors.</p>
      <p><strong>Email:</strong> ${email}</p>
    `,
    joining: `
      <p>Dear ${employeeName},</p>
      <p>We are pleased to confirm your appointment as <strong>${role}</strong> in the <strong>${department}</strong> department.</p>
      <p>Your joining date and responsibilities will be communicated by the management team. We are happy to welcome you to the organization and look forward to your contribution.</p>
      <p>Welcome aboard and best wishes for a successful journey with us.</p>
    `,
    relieving: `
      <p>To whom it may concern,</p>
      <p>This letter confirms that <strong>${employeeName}</strong> has formally relieved from the role of <strong>${role}</strong> in the <strong>${department}</strong> department, effective as of the exit date approved by the organization.</p>
      <p>The employee has completed their responsibilities and has been relieved in good standing. We appreciate their service and wish them success in all future opportunities.</p>
    `,
    salary: `
      <p>Dear ${employeeName},</p>
      <p>This is to confirm the current salary arrangement for the employee holding the position of <strong>${role}</strong> in the <strong>${department}</strong> department.</p>
      <p>The official salary and compensation details are maintained by the HR department and are valid as per the company policy and payroll records.</p>
      <p>We appreciate your dedication and continued contribution to the organization.</p>
    `,
    promotion: `
      <p>Dear ${employeeName},</p>
      <p>We are pleased to inform you that, based on your performance and contribution, you have been promoted to the position of <strong>${role}</strong> in the <strong>${department}</strong> department.</p>
      <p>Your commitment, professionalism, and hard work have been recognized by the organization, and we are confident that you will continue to excel in this new responsibility.</p>
      <p>Congratulations and best wishes for continued success.</p>
    `,
    warning: `
      <p>Dear ${employeeName},</p>
      <p>This letter serves as an official warning regarding your recent conduct and performance while working in the <strong>${department}</strong> department.</p>
      <p>The organization expects adherence to company policies, professionalism, and punctuality in all work-related matters. This warning is intended to encourage improvement and ensure compliance with required standards.</p>
      <p>We expect corrective action and improved performance going forward.</p>
    `,
    appraisal: `
      <p>Dear ${employeeName},</p>
      <p>This letter summarizes the annual appraisal for <strong>${employeeName}</strong> in the role of <strong>${role}</strong> within the <strong>${department}</strong> department.</p>
      <p>The performance review reflects a positive contribution, cooperation, and dedication to responsibilities assigned during the evaluation period. We appreciate the effort and commitment shown throughout the year.</p>
      <p>We look forward to continued progress and contribution in the coming period.</p>
    `
  };

  const body = customContent
    ? `<p>${escapeHtml(customContent).replace(/\n/g, '</p><p>')}</p>`
    : (templates[letterType] || templates.experience);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.7; color: #1f2933; margin: 40px; }
          .letter { max-width: 760px; margin: 0 auto; padding: 30px 35px; border: 1px solid #d9e2ec; border-radius: 10px; background: #fff; }
          .heading { text-align: center; font-size: 26px; font-weight: 700; margin-bottom: 20px; }
          .meta { margin-bottom: 20px; font-size: 12px; color: #52606d; }
          .signature { margin-top: 30px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="letter">
          <div class="heading">${title}</div>
          <div class="meta">Generated on ${dateText}</div>
          ${body}
          <div class="signature">HR Department<br />Company Administration</div>
        </div>
      </body>
    </html>
  `;
};

const buildLetterQuery = (req) => {
  const query = {};

  if (req.user.role === ROLES.EMPLOYEE) {
    query.employeeId = req.user._id;
  }

  return query;
};

const createLetter = asyncHandler(async (req, res) => {
  const { letterType, title, content, employeeId } = req.body || {};

  if (!allowableLetterTypes.includes(letterType)) {
    throw new AppError('Invalid letter type', 400);
  }

  if (!employeeId) {
    throw new AppError('Employee selection is required', 400);
  }

  const targetEmployee = await Employee.findById(employeeId);

  if (!targetEmployee) {
    throw new AppError('Employee not found', 404);
  }

  const generatedTitle = title || `${letterType.charAt(0).toUpperCase() + letterType.slice(1)} Letter`;
  const generatedContent = buildLetterTemplate(targetEmployee, letterType, generatedTitle, content);

  const letter = await Letter.create({
    employeeId: targetEmployee._id,
    createdBy: req.user._id,
    letterType,
    title: generatedTitle,
    content: generatedContent,
    status: 'generated',
    generatedBy: req.user._id
  });

  const recipient = await findLetterRecipient(letter.employeeId, targetEmployee);
  if (recipient?.email) {
    await sendLetterEmail(recipient, letter);
  }

  sendSuccess(res, letter, 201);
});

const updateLetter = asyncHandler(async (req, res) => {
  const letter = await Letter.findById(req.params.id);

  if (!letter) {
    throw new AppError('Letter not found', 404);
  }

  if (req.user.role === ROLES.EMPLOYEE && letter.employeeId.toString() !== req.user._id.toString()) {
    throw new AppError('Access denied', 403);
  }

  const { letterType, title, content, employeeId, status } = req.body || {};

  if (letterType !== undefined) {
    if (!allowableLetterTypes.includes(letterType)) {
      throw new AppError('Invalid letter type', 400);
    }
    letter.letterType = letterType;
  }

  if (title !== undefined) letter.title = title;
  if (content !== undefined) letter.content = content;
  if (employeeId !== undefined) letter.employeeId = employeeId;
  if (status !== undefined && req.user.role !== ROLES.EMPLOYEE) {
    letter.status = status;
  }

  await letter.save();
  sendSuccess(res, letter, 200);
});

const getLetters = asyncHandler(async (req, res) => {
  const letters = await Letter.find(buildLetterQuery(req)).sort({ createdAt: -1 });
  sendSuccess(res, letters);
});

const getLetterById = asyncHandler(async (req, res) => {
  const letter = await Letter.findById(req.params.id);

  if (!letter) {
    throw new AppError('Letter not found', 404);
  }

  if (req.user.role === ROLES.EMPLOYEE && letter.employeeId.toString() !== req.user._id.toString()) {
    throw new AppError('Access denied', 403);
  }

  sendSuccess(res, letter);
});

const generateLetter = asyncHandler(async (req, res) => {
  const letter = await Letter.findById(req.params.id);

  if (!letter) {
    throw new AppError('Letter not found', 404);
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    throw new AppError('Access denied', 403);
  }

  const employee = await Employee.findById(letter.employeeId);
  const generatedHtml = buildLetterTemplate(employee, letter.letterType, letter.title);

  letter.content = generatedHtml;
  letter.status = 'generated';
  letter.generatedBy = req.user._id;
  await letter.save();

  const recipient = await findLetterRecipient(letter.employeeId, employee);
  if (recipient?.email) {
    await sendLetterEmail(recipient, { ...letter.toObject(), content: generatedHtml });
  }

  sendSuccess(res, { ...letter.toObject(), content: generatedHtml }, 200);
});

const deleteLetter = asyncHandler(async (req, res) => {
  const letter = await Letter.findById(req.params.id);

  if (!letter) {
    throw new AppError('Letter not found', 404);
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    throw new AppError('Employees cannot delete letters', 403);
  }

  await letter.deleteOne();
  sendMessage(res, 'Letter deleted successfully', 200);
});

module.exports = {
  createLetter,
  updateLetter,
  getLetters,
  getLetterById,
  generateLetter,
  deleteLetter
};
