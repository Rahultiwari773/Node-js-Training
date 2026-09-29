const fs = require('fs/promises');
const sharp = require('sharp');
const { PDFParse } = require('pdf-parse');
const { createWorker, PSM } = require('tesseract.js');
const Document = require('../models/documentModel');
const { getDocumentPath } = require('../utils/documentStorage');

const firstMatch = (text, pattern) => text.match(pattern)?.[1]?.trim() || '';

const findLabeledValue = (text, labels) => {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = text.match(new RegExp(`\\b(?:${labelPattern})\\b\\s*[:\\-]?\\s*([^\\n|]+)`, 'i'));
  if (!match) return '';

  const repeatedLabelPattern = new RegExp(`^(?:[\\s/:|,.-]*(?:${labelPattern})\\b\\s*[:\\-]?)+`, 'i');
  return match[1].replace(repeatedLabelPattern, '').replace(/^[\s/:|,.-]+|[\s|]+$/g, '').trim();
};

const findAadhaarName = (text) => {
  const labeledName = findLabeledValue(text, ['full name', 'name']);
  if (labeledName) return labeledName;

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const birthLine = lines.findIndex((line) => /\b(?:dob|date of birth|year of birth)\b/i.test(line));
  if (birthLine < 1) return '';

  const candidates = lines.slice(Math.max(0, birthLine - 4), birthLine).reverse();
  return candidates.find((line) => (
    /^[A-Za-z][A-Za-z .'-]{2,59}$/.test(line)
    && !/\b(?:government|india|unique|identification|authority|aadhaar|aadhar|uidai|male|female|address|enrolment|enrollment)\b/i.test(line)
  )) || '';
};

const extractStructuredFields = (text, documentType) => {
  const normalizedText = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const fields = {
    name: documentType === 'Aadhar'
      ? findAadhaarName(normalizedText)
      : findLabeledValue(normalizedText, ['full name', 'name']),
    dateOfBirth: findLabeledValue(normalizedText, ['date of birth', 'dob', 'birth date']),
    address: findLabeledValue(normalizedText, ['address', 'residential address']),
    gender: findLabeledValue(normalizedText, ['gender', 'sex'])
  };

  if (documentType === 'Aadhar') {
    fields.aadhaarNumber = normalizedText.match(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/)?.[0]?.replace(/[ -]/g, '') || '';
  }

  if (documentType === 'PAN') {
    fields.panNumber = normalizedText.match(/\b[A-Z]{5}\d{4}[A-Z]\b/i)?.[0]?.toUpperCase() || '';
    fields.fatherName = findLabeledValue(normalizedText, ['father name', "father's name"]);
  }

  if (documentType === 'Passport') {
    fields.passportNumber = normalizedText.match(/\b[A-Z][0-9]{7}\b/i)?.[0]?.toUpperCase() || '';
    fields.nationality = findLabeledValue(normalizedText, ['nationality']);
    fields.issueDate = findLabeledValue(normalizedText, ['date of issue', 'issue date']);
    fields.expiryDate = findLabeledValue(normalizedText, ['date of expiry', 'expiry date']);
  }

  if (['Offer Letter', 'Joining Letter', 'Experience Letter', 'Salary Slip'].includes(documentType)) {
    fields.employeeId = findLabeledValue(normalizedText, ['employee id', 'employee number', 'staff id']);
    fields.department = findLabeledValue(normalizedText, ['department', 'division']);
    fields.designation = findLabeledValue(normalizedText, ['designation', 'job title', 'position']);
    fields.joiningDate = findLabeledValue(normalizedText, ['joining date', 'date of joining']);
    fields.salary = findLabeledValue(normalizedText, ['salary', 'gross salary', 'net salary']);
  }

  const knownLabels = new Set([
    'name', 'full name', 'date of birth', 'dob', 'birth date', 'address', 'residential address',
    'gender', 'sex', 'aadhaar number', 'aadhar number', 'pan number', 'father name', "father's name",
    'passport number', 'nationality', 'date of issue', 'issue date', 'date of expiry', 'expiry date',
    'employee id', 'employee number', 'staff id', 'department', 'division', 'designation', 'job title',
    'position', 'joining date', 'date of joining', 'salary', 'gross salary', 'net salary'
  ]);
  const additionalDetails = [];
  normalizedText.split('\n').forEach((line) => {
    const match = line.trim().match(/^([A-Za-z][A-Za-z0-9 /().,'#_-]{1,39}?)\s*[:\-]\s*(\S.*)$/);
    if (!match) return;

    const label = match[1].trim();
    if (knownLabels.has(label.toLowerCase())) return;
    const value = match[2].trim();
    const isDuplicate = Object.entries(fields).some(([key, fieldValue]) => (
      key !== 'additionalDetails' && fieldValue.toLowerCase() === value.toLowerCase()
    ));
    if (!isDuplicate) additionalDetails.push({ label, value });
  });

  if (additionalDetails.length) fields.additionalDetails = additionalDetails;

  Object.keys(fields).forEach((key) => {
    if (key !== 'additionalDetails' && !fields[key]) delete fields[key];
  });

  return {
    ...fields,
    needsReview: true
  };
};

const formatStructuredFields = (fields) => Object.entries(fields)
  .filter(([key]) => key !== 'needsReview')
  .flatMap(([key, value]) => key === 'additionalDetails'
    ? value.map(({ label, value: detailValue }) => `${label}: ${detailValue}`)
    : [`${key.replace(/([A-Z])/g, ' $1')}: ${value}`])
  .join('\n');

const scoreImageResult = (result, documentType) => {
  const fields = extractStructuredFields(result.text, documentType);
  const fieldValues = Object.entries(fields)
    .filter(([key]) => key !== 'needsReview' && key !== 'additionalDetails')
    .filter(([, value]) => Boolean(value));
  const preferredFields = documentType === 'Aadhar'
    ? ['name', 'dateOfBirth', 'aadhaarNumber']
    : ['name', 'panNumber', 'passportNumber', 'employeeId', 'salary'];
  const preferredCount = preferredFields.filter((key) => Boolean(fields[key])).length;
  const otherCount = fieldValues.length - preferredCount;

  return result.confidence + preferredCount * 12 + otherCount * 3 + Math.min(result.text.length, 500) / 250;
};

const prepareImageVariants = async (filePath) => {
  const normalized = await sharp(filePath, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 2400, height: 3400, fit: 'inside' })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
  const highContrast = await sharp(normalized)
    .threshold(165)
    .png()
    .toBuffer();

  return [normalized, highContrast];
};

const extractImageText = async (filePath, documentType) => {
  const worker = await createWorker('eng');

  try {
    const imageVariants = await prepareImageVariants(filePath);
    const pageSegmentationModes = documentType === 'Aadhar'
      ? [PSM.SPARSE_TEXT, PSM.SINGLE_BLOCK, PSM.AUTO]
      : [PSM.AUTO, PSM.SINGLE_BLOCK];
    const candidates = [];

    for (const mode of pageSegmentationModes) {
      await worker.setParameters({
        tessedit_pageseg_mode: mode,
        preserve_interword_spaces: '1'
      });
      for (const image of imageVariants) {
        const result = await worker.recognize(image);
        candidates.push({
          text: result.data.text.trim(),
          confidence: Number(result.data.confidence || 0)
        });
      }
    }

    return candidates.reduce((best, candidate) => (
      scoreImageResult(candidate, documentType) > scoreImageResult(best, documentType) ? candidate : best
    ));
  } finally {
    await worker.terminate();
  }
};

const extractPdfText = async (filePath) => {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  const text = result.text.trim();

  if (!text) {
    const error = new Error('Scanned PDFs require image conversion before OCR');
    error.code = 'OCR_NOT_SUPPORTED';
    throw error;
  }

  return { text, confidence: 100 };
};

const extractDocumentText = async (document) => {
  const filePath = getDocumentPath(document.fileName);

  if (!filePath) {
    throw new Error('Stored document path is invalid');
  }

  if (document.mimeType === 'application/pdf') {
    return extractPdfText(filePath);
  }

  return extractImageText(filePath, document.documentType);
};

const processDocumentOcr = async (document) => {
  document.ocrStatus = 'pending';
  document.ocrError = '';
  await document.save();

  try {
    const result = await extractDocumentText(document);
    const fields = extractStructuredFields(result.text, document.documentType);
    const fieldSummary = formatStructuredFields(fields);
    document.ocrText = fieldSummary ? `${fieldSummary}\n\nRaw OCR text:\n${result.text}` : result.text;
    document.ocrConfidence = result.confidence;
    document.ocrFields = fields;
    document.ocrStatus = 'completed';
    document.ocrProcessedAt = new Date();
    document.ocrError = '';
  } catch (error) {
    document.ocrText = '';
    document.ocrConfidence = null;
    document.ocrFields = { needsReview: true };
    document.ocrStatus = error.code === 'OCR_NOT_SUPPORTED' ? 'not_supported' : 'failed';
    document.ocrProcessedAt = new Date();
    document.ocrError = error.message;
  }

  await document.save();
  return document;
};

const getDocumentWithOcr = (id) => Document.findById(id).select('+filePath +ocrText +ocrError');

module.exports = {
  extractStructuredFields,
  extractDocumentText,
  processDocumentOcr,
  getDocumentWithOcr
};
