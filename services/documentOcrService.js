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

const findDocumentNumber = (text, pattern, labels) => {
  const labeledValue = findLabeledValue(text, labels);
  const normalizedValue = labeledValue.replace(/[\s-]/g, '').toUpperCase();
  if (normalizedValue && pattern.test(normalizedValue)) return normalizedValue;

  return text.match(pattern)?.[0]?.replace(/[\s-]/g, '').toUpperCase() || '';
};

const extractStructuredFields = (text, documentType) => {
  const normalizedText = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const fields = {
    name: documentType === 'Aadhar'
      ? findAadhaarName(normalizedText)
      : findLabeledValue(normalizedText, ['full name', 'name', 'elector name', "elector's name", 'name of elector']),
    dateOfBirth: findLabeledValue(normalizedText, ['date of birth', 'dob', 'birth date']),
    address: findLabeledValue(normalizedText, ['address', 'residential address']),
    gender: findLabeledValue(normalizedText, ['gender', 'sex'])
  };

  if (documentType === 'Aadhar') {
    fields.aadhaarNumber = normalizedText.match(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/)?.[0]?.replace(/[ -]/g, '') || '';
  }

  if (documentType === 'PAN') {
    fields.panNumber = findDocumentNumber(normalizedText, /\b[A-Z]{5}\d{4}[A-Z]\b/i, ['pan number', 'permanent account number', 'pan']);
    fields.fatherName = findLabeledValue(normalizedText, ['father name', "father's name"]);
  }

  if (documentType === 'Voter ID') {
    fields.voterIdNumber = findDocumentNumber(normalizedText, /\b[A-Z]{3}\s*-?\s*\d{7}\b/i, ['voter id', 'epic number', 'epic no', 'elector photo identity card']);
    fields.relativeName = findLabeledValue(normalizedText, ['father name', "father's name", 'husband name', "husband's name", 'relative name']);
  }

  if (documentType === 'Driving Licence') {
    fields.drivingLicenseNumber = findDocumentNumber(normalizedText, /\b[A-Z]{2}\s*-?\s*\d{2}\s*-?\s*\d{4}\s*-?\s*\d{7}\b/i, [
      'driving licence number',
      'driving license number',
      'licence number',
      'license number',
      'dl number',
      'dl no'
    ]);
    fields.issueDate = findLabeledValue(normalizedText, ['date of issue', 'issue date']);
    fields.expiryDate = findLabeledValue(normalizedText, ['valid till', 'validity', 'date of expiry', 'expiry date']);
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
    'permanent account number', 'pan', 'voter id', 'epic number', 'epic no', 'elector photo identity card',
    'elector name', "elector's name", 'name of elector',
    'husband name', "husband's name", 'relative name', 'driving licence number', 'driving license number',
    'licence number', 'license number', 'dl number', 'dl no', 'valid till', 'validity',
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

  const validationErrors = [];
  const requiredIdentityFields = {
    Aadhar: ['aadhaarNumber'],
    PAN: ['panNumber'],
    'Voter ID': ['voterIdNumber'],
    'Driving Licence': ['drivingLicenseNumber']
  };
  const identityPatterns = {
    aadhaarNumber: /^\d{12}$/,
    panNumber: /^[A-Z]{5}\d{4}[A-Z]$/,
    voterIdNumber: /^[A-Z]{3}\d{7}$/,
    drivingLicenseNumber: /^[A-Z]{2}\d{2}\d{4}\d{7}$/
  };
  const expectedFields = requiredIdentityFields[documentType] || [];
  expectedFields.forEach((key) => {
    if (!fields[key] || !identityPatterns[key].test(fields[key])) {
      validationErrors.push(`A valid ${key.replace(/([A-Z])/g, ' $1').toLowerCase()} was not detected. Check the document image and enter the value manually if necessary.`);
    }
  });

  return {
    ...fields,
    needsReview: true,
    ...(validationErrors.length ? { validationErrors } : {})
  };
};

const formatStructuredFields = (fields) => Object.entries(fields)
  .filter(([key]) => !['needsReview', 'validationErrors'].includes(key))
  .flatMap(([key, value]) => key === 'additionalDetails'
    ? value.map(({ label, value: detailValue }) => `${label}: ${detailValue}`)
    : [`${key.replace(/([A-Z])/g, ' $1')}: ${value}`])
  .join('\n');

const scoreImageResult = (result, documentType) => {
  const fields = extractStructuredFields(result.text, documentType);
  const fieldValues = Object.entries(fields)
    .filter(([key]) => !['needsReview', 'validationErrors', 'additionalDetails'].includes(key))
    .filter(([, value]) => Boolean(value));
  const preferredFields = documentType === 'Aadhar'
    ? ['name', 'dateOfBirth', 'aadhaarNumber']
    : documentType === 'PAN'
      ? ['name', 'panNumber', 'dateOfBirth']
      : documentType === 'Voter ID'
        ? ['name', 'voterIdNumber', 'dateOfBirth']
        : documentType === 'Driving Licence'
          ? ['name', 'drivingLicenseNumber', 'dateOfBirth']
          : ['name', 'panNumber', 'passportNumber', 'employeeId', 'salary'];
  const preferredCount = preferredFields.filter((key) => Boolean(fields[key])).length;
  const otherCount = fieldValues.length - preferredCount;

  return result.confidence + preferredCount * 12 + otherCount * 3 + Math.min(result.text.length, 500) / 250;
};

const prepareImageVariants = async (image) => {
  const normalized = await sharp(image, { limitInputPixels: 40_000_000 })
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

const measureImageSharpness = async (image) => {
  const { data, info } = await sharp(image)
    .greyscale()
    .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let total = 0;
  let count = 0;

  for (let y = 1; y < info.height - 1; y += 1) {
    for (let x = 1; x < info.width - 1; x += 1) {
      const index = (y * info.width) + x;
      const current = data[index];
      const left = data[index - 1];
      const right = data[index + 1];
      const top = data[index - info.width];
      const bottom = data[index + info.width];
      const laplacian = 4 * current - left - right - top - bottom;

      total += laplacian * laplacian;
      count += 1;
    }
  }

  return count ? total / count : 0;
};

const isImageSuitableForOcr = async (image) => {
  try {
    const sharpness = await measureImageSharpness(image);
    return sharpness >= 300;
  } catch (error) {
    return false;
  }
};

const unreadableImageError = () => {
  const error = new Error('This document is too blurry, too dark, or low-contrast to read. Upload a sharp, well-lit image showing the complete document.');
  error.code = 'OCR_BLURRY_IMAGE';
  return error;
};

const recognizeImage = async (worker, image, documentType) => {
  const imageVariants = await prepareImageVariants(image);
  const pageSegmentationModes = documentType === 'Aadhar'
    ? [PSM.SPARSE_TEXT, PSM.SINGLE_BLOCK, PSM.AUTO]
    : [PSM.AUTO, PSM.SINGLE_BLOCK];
  const candidates = [];

  for (const mode of pageSegmentationModes) {
    await worker.setParameters({
      tessedit_pageseg_mode: mode,
      preserve_interword_spaces: '1'
    });
    for (const imageVariant of imageVariants) {
      const result = await worker.recognize(imageVariant);
      candidates.push({
        text: result.data.text.trim(),
        confidence: Number(result.data.confidence || 0)
      });
    }
  }

  return candidates.reduce((best, candidate) => (
    scoreImageResult(candidate, documentType) > scoreImageResult(best, documentType) ? candidate : best
  ));
};

const extractImageText = async (filePath, documentType) => {
  if (!await isImageSuitableForOcr(filePath)) throw unreadableImageError();

  const worker = await createWorker('eng');
  try {
    return await recognizeImage(worker, filePath, documentType);
  } finally {
    await worker.terminate();
  }
};

const extractPdfText = async (filePath, documentType) => {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    if (text.length >= 40) return { text, confidence: 100 };

    const screenshots = await parser.getScreenshot({
      first: 3,
      desiredWidth: 1800,
      imageBuffer: true,
      imageDataUrl: false
    });
    if (!screenshots.pages.length) {
      const error = new Error('No readable pages were found in this PDF.');
      error.code = 'OCR_NOT_SUPPORTED';
      throw error;
    }

    const worker = await createWorker('eng');
    try {
      const pageResults = [];
      for (const page of screenshots.pages) {
        if (await isImageSuitableForOcr(Buffer.from(page.data))) {
          pageResults.push(await recognizeImage(worker, Buffer.from(page.data), documentType));
        }
      }
      if (!pageResults.length) throw unreadableImageError();
      return {
        text: pageResults.map((page) => page.text).filter(Boolean).join('\n'),
        confidence: pageResults.reduce((total, page) => total + page.confidence, 0) / pageResults.length
      };
    } finally {
      await worker.terminate();
    }
  } finally {
    await parser.destroy();
  }
};

const extractDocumentText = async (document) => {
  const filePath = getDocumentPath(document.fileName);

  if (!filePath) {
    throw new Error('Stored document path is invalid');
  }

  if (document.mimeType === 'application/pdf') {
    return extractPdfText(filePath, document.documentType);
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
  getDocumentWithOcr,
  isImageSuitableForOcr
};
