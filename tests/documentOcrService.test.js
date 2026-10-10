const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { extractStructuredFields, isImageSuitableForOcr } = require('../services/documentOcrService');

describe('document OCR field extraction', () => {
  test('cleans repeated labels and keeps other labeled values', () => {
    const text = [
      'DATE OF BIRTH /DOB: 26/01/1979',
      'AADHAAR NUMBER: 664128049316',
      'Blood Group: O Positive'
    ].join('\n');

    expect(extractStructuredFields(text, 'Aadhar')).toEqual({
      dateOfBirth: '26/01/1979',
      aadhaarNumber: '664128049316',
      additionalDetails: [{ label: 'Blood Group', value: 'O Positive' }],
      needsReview: true
    });
  });

  test('finds Aadhaar names on the line above date of birth when the label is missing', () => {
    const text = [
      'GOVERNMENT OF INDIA',
      'JOHN DOE',
      'DOB: 26/01/1979',
      'AADHAAR NUMBER: 664128049316'
    ].join('\n');

    expect(extractStructuredFields(text, 'Aadhar').name).toBe('JOHN DOE');
  });

  test('reads an Aadhaar name when OCR places it on the line after its label', () => {
    const text = ['Name', 'Jane Doe', 'Date of Birth: 01/02/1990'].join('\n');

    expect(extractStructuredFields(text, 'Aadhar').name).toBe('Jane Doe');
  });

  test('extracts PAN number and labeled name and warns when its format is missing', () => {
    const fields = extractStructuredFields([
      'Permanent Account Number: ABCDE1234F',
      'Name: Asha Rao',
      "Father's Name: Mohan Rao"
    ].join('\n'), 'PAN');

    expect(fields).toMatchObject({
      name: 'Asha Rao',
      panNumber: 'ABCDE1234F',
      fatherName: 'Mohan Rao',
      needsReview: true
    });
    expect(fields.validationErrors).toBeUndefined();
    expect(extractStructuredFields('Name: Asha Rao', 'PAN').validationErrors).toHaveLength(1);
  });

  test('extracts voter ID details and validates the EPIC number format', () => {
    const fields = extractStructuredFields([
      "Elector's Name: Priya Sharma",
      'EPIC No: ABC1234567',
      "Father's Name: Raj Sharma",
      'Address: 24 Main Street'
    ].join('\n'), 'Voter ID');

    expect(fields).toMatchObject({
      name: 'Priya Sharma',
      voterIdNumber: 'ABC1234567',
      relativeName: 'Raj Sharma',
      address: '24 Main Street',
      needsReview: true
    });
    expect(fields.validationErrors).toBeUndefined();
  });

  test('extracts a driving licence number and date fields', () => {
    const fields = extractStructuredFields([
      'Name: Ravi Kumar',
      'DL No: MH-12-2017-0123456',
      'Date of Issue: 01/01/2017',
      'Valid Till: 01/01/2037'
    ].join('\n'), 'Driving Licence');

    expect(fields).toMatchObject({
      name: 'Ravi Kumar',
      drivingLicenseNumber: 'MH1220170123456',
      issueDate: '01/01/2017',
      expiryDate: '01/01/2037',
      needsReview: true
    });
    expect(fields.validationErrors).toBeUndefined();
  });

  test('flags an unrecognized driving licence number instead of treating OCR as valid', () => {
    expect(extractStructuredFields('Name: Ravi Kumar\nDL No: unclear', 'Driving Licence').validationErrors)
      .toEqual(['A valid driving license number was not detected. Check the document image and enter the value manually if necessary.']);
  });

  test('rejects blurred images that are not suitable for OCR', async () => {
    const fixtureDir = path.join(__dirname, 'fixtures');
    await fs.mkdir(fixtureDir, { recursive: true });

    const sharpSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">
        <rect width="100%" height="100%" fill="white"/>
        <g fill="black" font-size="52" font-family="Arial">
          <text x="70" y="180">AADHAAR</text>
          <text x="70" y="260">JOHN DOE</text>
          <text x="70" y="340">DOB: 01/02/1990</text>
          <text x="70" y="420">ADDRESS: 24 MAIN STREET</text>
        </g>
      </svg>
    `;

    const sharpPath = path.join(fixtureDir, 'sharp-document.png');
    const blurredPath = path.join(fixtureDir, 'blurred-document.png');

    await sharp(Buffer.from(sharpSvg)).png().toFile(sharpPath);
    await sharp(sharpPath).blur(3).png().toFile(blurredPath);

    await expect(isImageSuitableForOcr(sharpPath)).resolves.toBe(true);
    await expect(isImageSuitableForOcr(blurredPath)).resolves.toBe(false);
  });
});
