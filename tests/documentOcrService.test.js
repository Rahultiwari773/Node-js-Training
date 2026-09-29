const { extractStructuredFields } = require('../services/documentOcrService');

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
});
