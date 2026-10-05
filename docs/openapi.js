const reference = (name) => ({ $ref: `#/components/schemas/${name}` });

const successSchema = (dataSchema) => ({
  type: 'object',
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema
  }
});

const messageSchema = {
  type: 'object',
  required: ['success', 'message'],
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string' }
  }
};

const paths = {};

const addEndpoint = (path, method, tag, summary, options = {}) => {
  const pathParameters = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    description: `MongoDB ID for ${match[1]}`,
    schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
  }));
  const operation = {
    tags: [tag],
    summary,
    operationId: `${method}${path.replace(/[^a-zA-Z0-9]+/g, '_')}`,
    ...(options.description ? { description: options.description } : {}),
    ...(options.security === false ? {} : {
      security: options.security || [{ bearerAuth: [] }]
    }),
    parameters: [...pathParameters, ...(options.parameters || [])],
    responses: {}
  };

  if (options.body) {
    operation.requestBody = {
      required: options.bodyRequired !== false,
      content: {
        [options.contentType || 'application/json']: {
          schema: reference(options.body)
        }
      }
    };
  }

  if (options.rawResponse) {
    operation.responses[String(options.status || 200)] = {
      description: options.responseDescription || 'File content',
      content: options.rawResponse === true
        ? { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } }
        : options.rawResponse
    };
  } else if (options.response === 'message') {
    operation.responses[String(options.status || 200)] = {
      description: options.responseDescription || 'Operation completed',
      content: { 'application/json': { schema: messageSchema } }
    };
  } else {
    const responseData = options.response
      ? reference(options.response)
      : options.responseArray
        ? { type: 'array', items: reference(options.responseArray) }
        : { type: 'object', additionalProperties: true };
    const responseBody = successSchema(responseData);
    if (options.pagination) {
      responseBody.properties.pagination = reference('Pagination');
      responseBody.required.push('pagination');
    }
    if (options.message) responseBody.properties.message = { type: 'string' };
    operation.responses[String(options.status || 200)] = {
      description: options.responseDescription || 'Successful response',
      content: { 'application/json': { schema: responseBody } }
    };
  }

  if (options.htmlResponse) {
    operation.responses[String(options.status || 200)] = {
      description: 'HTML page',
      content: { 'text/html': { schema: { type: 'string' } } }
    };
  }

  if (options.extraResponses) {
    Object.assign(operation.responses, options.extraResponses);
  }

  operation.responses['400'] ||= { description: 'Invalid request or validation error', content: { 'application/json': { schema: reference('ApiError') } } };
  if (options.security !== false) {
    operation.responses['401'] ||= { description: 'Authentication required or token expired', content: { 'application/json': { schema: reference('ApiError') } } };
    operation.responses['403'] ||= { description: 'Insufficient role or resource access', content: { 'application/json': { schema: reference('ApiError') } } };
  }
  operation.responses['404'] ||= { description: 'Resource not found', content: { 'application/json': { schema: reference('ApiError') } } };
  operation.responses['500'] ||= { description: 'Unexpected server error', content: { 'application/json': { schema: reference('ApiError') } } };

  paths[path] ||= {};
  paths[path][method] = operation;
};

const queryParameter = (name, description, schema, required = false) => ({
  name,
  in: 'query',
  required,
  description,
  schema
});

const authTag = 'Authentication';
addEndpoint('/auth/register', 'post', authTag, 'Register an employee account', { security: false, body: 'RegisterRequest', response: 'RegisterResult', status: 201 });
addEndpoint('/auth/verify-email', 'get', authTag, 'Verify an email address from its one-time link', { security: false, response: 'MessageResult', parameters: [queryParameter('token', 'Email verification token', { type: 'string' }, true)] });
addEndpoint('/auth/verify-email', 'post', authTag, 'Verify an email address with a token', { security: false, body: 'TokenRequest', response: 'MessageResult' });
addEndpoint('/auth/resend-verification', 'post', authTag, 'Resend the email verification message', { security: false, body: 'EmailRequest', response: 'MessageResult' });
addEndpoint('/auth/login', 'post', authTag, 'Sign in and create a session', { security: false, body: 'LoginRequest', response: 'LoginResult', description: 'When two-factor authentication is enabled, the first password-only request returns requiresTwoFactor. Submit the password and twoFactorCode to complete sign-in. The refresh token is set as an HttpOnly cookie.' });
addEndpoint('/auth/refresh', 'post', authTag, 'Rotate the refresh token and issue an access token', { security: [{ refreshCookie: [] }], response: 'AccessSession' });
addEndpoint('/auth/forgot-password', 'post', authTag, 'Request a password reset link', { security: false, body: 'EmailRequest', response: 'MessageResult' });
addEndpoint('/auth/reset-password', 'get', authTag, 'Open the password reset page', { security: false, htmlResponse: true, parameters: [queryParameter('token', 'Password reset token', { type: 'string' }, true)] });
addEndpoint('/auth/reset-password', 'post', authTag, 'Set a new password', { security: false, body: 'PasswordResetRequest', response: 'MessageResult' });
addEndpoint('/auth/profile', 'get', authTag, 'Get the current account profile', { response: 'UserAccount' });
addEndpoint('/auth/users/accounts', 'get', authTag, 'List accounts the current role may manage', { responseArray: 'UserAccount', description: 'Available to HR, HR managers, admins, and super admins. HR sees employee, manager, and HR accounts; administrator roles see all accounts. Credentials and authentication secrets are never returned.' });
addEndpoint('/auth/users/employees', 'get', authTag, 'List employee account registration and login metadata', { responseArray: 'UserAccount', description: 'Available to HR, HR managers, admins, and super admins. Passwords, tokens, and authentication secrets are never returned.' });
addEndpoint('/auth/users/role', 'post', authTag, 'Assign a role to a registered account', { body: 'RoleAssignment', response: 'RoleAssignmentResult', description: 'HR may assign employee, manager, or hr. Admins may also assign hr_manager and admin. Only super admins may assign super_admin. Users cannot change their own role.' });
addEndpoint('/auth/logout', 'post', authTag, 'Log out of the current session', { response: 'MessageResult' });
addEndpoint('/auth/logout-all', 'post', authTag, 'Revoke all sessions for the current account', { response: 'MessageResult' });
addEndpoint('/auth/sessions', 'get', authTag, 'List active sessions for the current account', { responseArray: 'AuthSession' });
addEndpoint('/auth/sessions/{id}', 'delete', authTag, 'Revoke one active session');
addEndpoint('/auth/2fa/setup', 'post', authTag, 'Create a two-factor enrollment QR code', { body: 'PasswordRequest', response: 'TwoFactorSetup' });
addEndpoint('/auth/2fa/enable', 'post', authTag, 'Enable two-factor authentication', { body: 'TwoFactorCodeRequest', response: 'RecoveryCodesResult' });
addEndpoint('/auth/2fa/disable', 'post', authTag, 'Disable two-factor authentication', { body: 'DisableTwoFactorRequest', response: 'MessageResult' });
addEndpoint('/auth/2fa/recovery-codes', 'post', authTag, 'Regenerate one-time recovery codes', { body: 'TwoFactorCodeRequest', response: 'RecoveryCodesResult' });

const employeeTag = 'Employees';
addEndpoint('/employees', 'get', employeeTag, 'List employees visible to the current role', { responseArray: 'Employee' });
addEndpoint('/employees', 'post', employeeTag, 'Create an employee record', { body: 'EmployeeInput', response: 'Employee', status: 201, description: 'Admin or HR role required.' });
addEndpoint('/employees/{id}', 'get', employeeTag, 'Get one employee');
addEndpoint('/employees/{id}', 'put', employeeTag, 'Update an employee record', { body: 'EmployeeUpdate' });
addEndpoint('/employees/{id}', 'delete', employeeTag, 'Delete an employee record', { response: 'message' });
addEndpoint('/employees/{id}/files', 'post', employeeTag, 'Upload a private employee file', { body: 'EmployeeFileUpload', contentType: 'multipart/form-data', response: 'EmployeeFile', status: 201, description: 'Multipart field `file`; maximum size is 5 MB.' });
addEndpoint('/employees/{id}/files', 'get', employeeTag, 'List files for an employee', { responseArray: 'EmployeeFile' });
addEndpoint('/employees/{id}/files/{fileId}', 'get', employeeTag, 'Download an employee file', { rawResponse: true, responseDescription: 'File download' });
addEndpoint('/employees/{id}/files/{fileId}/preview', 'get', employeeTag, 'Preview an employee file', { security: [{ bearerAuth: [] }, {}], parameters: [queryParameter('accessToken', 'Optional short-lived file-access token for generated preview links', { type: 'string' })], rawResponse: { 'application/pdf': { schema: { type: 'string', format: 'binary' } }, 'image/*': { schema: { type: 'string', format: 'binary' } } } });
addEndpoint('/employees/{id}/files/{fileId}', 'delete', employeeTag, 'Delete an employee file', { response: 'message' });

const salaryTag = 'Salaries';
addEndpoint('/salaries', 'get', salaryTag, 'List salary records visible to the current role', { responseArray: 'Salary' });
addEndpoint('/salaries', 'post', salaryTag, 'Create a salary record', { body: 'SalaryInput', response: 'Salary', status: 201, description: 'Admin or HR role required.' });
addEndpoint('/salaries/{id}', 'get', salaryTag, 'Get one salary record');
addEndpoint('/salaries/{id}', 'put', salaryTag, 'Update a salary record', { body: 'SalaryUpdate' });
addEndpoint('/salaries/{id}', 'delete', salaryTag, 'Delete a salary record', { response: 'message' });

const leaveTag = 'Leaves';
addEndpoint('/leaves', 'get', leaveTag, 'List leave requests visible to the current role', { responseArray: 'Leave' });
addEndpoint('/leaves', 'post', leaveTag, 'Submit a leave request', { body: 'LeaveInput', response: 'Leave', status: 201 });
addEndpoint('/leaves/{id}', 'get', leaveTag, 'Get one leave request');
addEndpoint('/leaves/{id}', 'put', leaveTag, 'Update a pending leave request', { body: 'LeaveUpdate' });
addEndpoint('/leaves/{id}/approve', 'patch', leaveTag, 'Approve a pending leave request', { response: 'Leave' });
addEndpoint('/leaves/{id}/reject', 'patch', leaveTag, 'Reject a pending leave request', { response: 'Leave' });
addEndpoint('/leaves/{id}', 'delete', leaveTag, 'Delete a leave request', { response: 'message' });

const letterTag = 'Letters';
addEndpoint('/letters', 'get', letterTag, 'List letters visible to the current role', { responseArray: 'Letter' });
addEndpoint('/letters', 'post', letterTag, 'Create an employee letter', { body: 'LetterInput', response: 'Letter', status: 201 });
addEndpoint('/letters/{id}', 'get', letterTag, 'Get one letter');
addEndpoint('/letters/{id}', 'put', letterTag, 'Update a letter', { body: 'LetterUpdate' });
addEndpoint('/letters/{id}/generate', 'post', letterTag, 'Generate a letter document');
addEndpoint('/letters/{id}', 'delete', letterTag, 'Delete a letter', { response: 'message' });

const announcementTag = 'Announcements';
addEndpoint('/announcements', 'get', announcementTag, 'List announcements', { responseArray: 'Announcement' });
addEndpoint('/announcements', 'post', announcementTag, 'Create an announcement', { body: 'ContentInput', response: 'Announcement', status: 201 });
addEndpoint('/announcements/{id}', 'get', announcementTag, 'Get one announcement');
addEndpoint('/announcements/{id}', 'put', announcementTag, 'Update an announcement', { body: 'ContentUpdate' });
addEndpoint('/announcements/{id}', 'delete', announcementTag, 'Delete an announcement', { response: 'message' });

const policyTag = 'Policies';
addEndpoint('/policies', 'get', policyTag, 'List policies', { responseArray: 'Policy' });
addEndpoint('/policies', 'post', policyTag, 'Create a policy', { body: 'ContentInput', response: 'Policy', status: 201 });
addEndpoint('/policies/{id}', 'get', policyTag, 'Get one policy');
addEndpoint('/policies/{id}', 'put', policyTag, 'Update a policy', { body: 'ContentUpdate' });
addEndpoint('/policies/{id}', 'delete', policyTag, 'Delete a policy', { response: 'message' });

const documentTag = 'Documents';
addEndpoint('/documents/upload', 'post', documentTag, 'Upload and process a document', { body: 'DocumentUpload', contentType: 'multipart/form-data', response: 'Document', status: 201 });
addEndpoint('/documents', 'get', documentTag, 'List and filter documents', {
  responseArray: 'Document',
  pagination: true,
  parameters: [
    queryParameter('page', 'Page number, starting at 1', { type: 'integer', minimum: 1 }),
    queryParameter('limit', 'Page size, maximum 100', { type: 'integer', minimum: 1, maximum: 100 }),
    queryParameter('employeeId', 'Filter by employee MongoDB ID', { type: 'string' }),
    queryParameter('documentType', 'Filter by document type', { type: 'string', enum: ['Aadhar', 'PAN', 'Passport', 'Resume', 'Offer Letter', 'Joining Letter', 'Experience Letter', 'Salary Slip', 'Other'] }),
    queryParameter('status', 'Filter by document status', { type: 'string', enum: ['active', 'archived'] }),
    queryParameter('search', 'Search original file names', { type: 'string', maxLength: 100 })
  ]
});
addEndpoint('/documents/{id}', 'get', documentTag, 'Get document metadata and OCR results');
addEndpoint('/documents/{id}/preview', 'get', documentTag, 'Preview a document file', { rawResponse: { 'application/pdf': { schema: { type: 'string', format: 'binary' } }, 'image/jpeg': { schema: { type: 'string', format: 'binary' } }, 'image/png': { schema: { type: 'string', format: 'binary' } } } });
addEndpoint('/documents/{id}/ocr', 'post', documentTag, 'Run OCR on a stored document', { response: 'Document', message: true });
addEndpoint('/documents/{id}', 'put', documentTag, 'Update document metadata or replace its file', { body: 'DocumentUpdate', contentType: 'multipart/form-data', response: 'Document', message: true });
addEndpoint('/documents/{id}', 'delete', documentTag, 'Delete a document and its file', { response: 'message' });

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Employee Portal API',
    version: '1.0.0',
    description: 'OpenAPI reference for the Employee Portal REST API. Most endpoints require a Bearer access token. Authentication sessions use an HttpOnly refresh cookie. The realtime Socket.IO server authenticates with the same access token.'
  },
  servers: [{ url: '/api', description: 'Current server' }],
  tags: [
    { name: 'Authentication' },
    { name: 'Employees' },
    { name: 'Salaries' },
    { name: 'Leaves' },
    { name: 'Letters' },
    { name: 'Announcements' },
    { name: 'Policies' },
    { name: 'Documents' }
  ],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      refreshCookie: { type: 'apiKey', in: 'cookie', name: 'employeePortalRefresh' }
    },
    schemas: {
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          details: { type: 'array', items: { type: 'object', additionalProperties: true } }
        },
        required: ['success', 'message']
      },
      MessageResult: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' }
        },
        required: ['page', 'limit', 'total', 'totalPages']
      },
      UserAccount: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['super_admin', 'admin', 'hr_manager', 'hr', 'manager', 'employee'] },
          isEmailVerified: { type: 'boolean' },
          twoFactorEnabled: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          lastLoginAt: { type: 'string', format: 'date-time', nullable: true }
        }
      },
      RegisterRequest: {
        type: 'object', required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 80 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8, format: 'password' }
        }
      },
      RegisterResult: {
        type: 'object', properties: { user: reference('UserAccount'), message: { type: 'string' } }
      },
      LoginRequest: {
        type: 'object', required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
          twoFactorCode: { type: 'string', minLength: 6, maxLength: 32 }
        }
      },
      LoginResult: {
        oneOf: [reference('AccessSession'), reference('TwoFactorChallenge')]
      },
      AccessSession: {
        type: 'object', properties: {
          accessToken: { type: 'string' },
          expiresIn: { type: 'integer', description: 'Access-token lifetime in seconds' },
          sessionId: { type: 'string' },
          user: reference('UserAccount')
        }, required: ['accessToken', 'expiresIn']
      },
      TwoFactorChallenge: {
        type: 'object', properties: { requiresTwoFactor: { type: 'boolean', enum: [true] } }, required: ['requiresTwoFactor']
      },
      EmailRequest: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
      TokenRequest: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
      PasswordRequest: { type: 'object', required: ['password'], properties: { password: { type: 'string', format: 'password' } } },
      PasswordResetRequest: {
        type: 'object', required: ['token', 'password'],
        properties: { token: { type: 'string' }, password: { type: 'string', minLength: 8, format: 'password' } }
      },
      TwoFactorCodeRequest: {
        type: 'object', required: ['code'], properties: { code: { type: 'string', minLength: 6, maxLength: 32 } }
      },
      DisableTwoFactorRequest: {
        type: 'object', required: ['code', 'password'],
        properties: { code: { type: 'string', minLength: 6, maxLength: 32 }, password: { type: 'string', format: 'password' } }
      },
      TwoFactorSetup: {
        type: 'object', properties: { secret: { type: 'string' }, qrCode: { type: 'string', format: 'uri' }, expiresAt: { type: 'string', format: 'date-time' } }
      },
      RecoveryCodesResult: { type: 'object', properties: { recoveryCodes: { type: 'array', items: { type: 'string' } }, message: { type: 'string' } } },
      AuthSession: {
        type: 'object', properties: {
          id: { type: 'string' }, deviceName: { type: 'string' }, ipAddress: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }, lastUsedAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' }, current: { type: 'boolean' }
        }
      },
      RoleAssignment: {
        type: 'object', required: ['email', 'role'],
        properties: {
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['employee', 'manager', 'hr', 'hr_manager', 'admin', 'super_admin'] }
        }
      },
      RoleAssignmentResult: { type: 'object', properties: { user: reference('UserAccount'), message: { type: 'string' } } },
      Employee: {
        type: 'object', properties: {
          _id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string', format: 'email' },
          department: { type: 'string' }, role: { type: 'string' }, salary: { type: 'number', minimum: 0 },
          createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      EmployeeInput: {
        type: 'object', required: ['name', 'email', 'department', 'role', 'salary'],
        properties: {
          name: { type: 'string', minLength: 2 }, email: { type: 'string', format: 'email' },
          department: { type: 'string' }, role: { type: 'string' }, salary: { type: 'number', minimum: 0 }
        }
      },
      EmployeeUpdate: {
        type: 'object', minProperties: 1,
        properties: {
          name: { type: 'string', minLength: 2 }, email: { type: 'string', format: 'email' },
          department: { type: 'string' }, role: { type: 'string' }, salary: { type: 'number', minimum: 0 }
        }
      },
      EmployeeFile: {
        type: 'object', properties: {
          id: { type: 'string' }, originalName: { type: 'string' }, mimeType: { type: 'string' },
          size: { type: 'integer' }, uploadedBy: { type: 'string' }, uploadedAt: { type: 'string', format: 'date-time' },
          previewUrl: { type: 'string', format: 'uri' }, downloadUrl: { type: 'string', format: 'uri' }
        }
      },
      EmployeeFileUpload: {
        type: 'object', required: ['file'], properties: {
          file: { type: 'string', format: 'binary', description: 'PDF, image, Word, or XLSX file; maximum 5 MB' }
        }
      },
      Salary: {
        type: 'object', properties: {
          _id: { type: 'string' }, employeeId: { type: 'string' }, amount: { type: 'number' },
          basicSalary: { type: 'number' }, allowances: { type: 'number' }, deductions: { type: 'number' },
          bonus: { type: 'number' }, overtimePay: { type: 'number' }, payPeriod: { type: 'string' },
          paymentDate: { type: 'string', format: 'date-time' }, paymentStatus: { type: 'string' }, notes: { type: 'string' }
        }
      },
      SalaryInput: {
        type: 'object', required: ['employeeId', 'amount'], properties: {
          employeeId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }, amount: { type: 'number', minimum: 0 },
          basicSalary: { type: 'number', minimum: 0 }, allowances: { type: 'number', minimum: 0 },
          deductions: { type: 'number', minimum: 0 }, bonus: { type: 'number', minimum: 0 },
          overtimePay: { type: 'number', minimum: 0 }, payPeriod: { type: 'string', enum: ['monthly', 'weekly', 'daily', 'yearly'] },
          paymentDate: { type: 'string', format: 'date' }, paymentStatus: { type: 'string', enum: ['pending', 'paid', 'cancelled'] },
          notes: { type: 'string', maxLength: 500 }
        }
      },
      SalaryUpdate: {
        type: 'object', minProperties: 1, properties: {
          employeeId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }, amount: { type: 'number', minimum: 0 },
          basicSalary: { type: 'number', minimum: 0 }, allowances: { type: 'number', minimum: 0 },
          deductions: { type: 'number', minimum: 0 }, bonus: { type: 'number', minimum: 0 },
          overtimePay: { type: 'number', minimum: 0 }, payPeriod: { type: 'string', enum: ['monthly', 'weekly', 'daily', 'yearly'] },
          paymentDate: { type: 'string', format: 'date' }, paymentStatus: { type: 'string', enum: ['pending', 'paid', 'cancelled'] },
          notes: { type: 'string', maxLength: 500 }
        }
      },
      Leave: {
        type: 'object', properties: {
          _id: { type: 'string' }, employeeId: { type: 'string' }, leaveType: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' }, endDate: { type: 'string', format: 'date-time' },
          reason: { type: 'string' }, status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] },
          approvedBy: { type: 'string', nullable: true }, createdAt: { type: 'string', format: 'date-time' }
        }
      },
      LeaveInput: {
        type: 'object', required: ['leaveType', 'startDate', 'endDate', 'reason'], properties: {
          leaveType: { type: 'string', enum: ['casual', 'sick', 'earned', 'maternity', 'paternity', 'other'] },
          startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' }, reason: { type: 'string', minLength: 5 }
        }
      },
      LeaveUpdate: {
        type: 'object', minProperties: 1, properties: {
          leaveType: { type: 'string', enum: ['casual', 'sick', 'earned', 'maternity', 'paternity', 'other'] },
          startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' },
          reason: { type: 'string', minLength: 5 }, status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] }
        }, description: 'All fields are optional for updates; allowed status changes depend on role.'
      },
      Letter: {
        type: 'object', properties: {
          _id: { type: 'string' }, employeeId: { type: 'string' }, letterType: { type: 'string' },
          title: { type: 'string' }, content: { type: 'string' }, status: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' }
        }
      },
      LetterInput: {
        type: 'object', required: ['letterType', 'title', 'employeeId'], properties: {
          letterType: { type: 'string', enum: ['experience', 'joining', 'relieving', 'salary', 'promotion', 'warning', 'appraisal'] },
          title: { type: 'string' }, content: { type: 'string' }, employeeId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      },
      LetterUpdate: {
        type: 'object', minProperties: 1, properties: {
          letterType: { type: 'string', enum: ['experience', 'joining', 'relieving', 'salary', 'promotion', 'warning', 'appraisal'] },
          title: { type: 'string' }, content: { type: 'string' }, employeeId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      },
      Announcement: {
        type: 'object', properties: {
          _id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'published'] }, createdBy: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Policy: { allOf: [reference('Announcement')] },
      ContentInput: {
        type: 'object', required: ['title', 'description'], properties: {
          title: { type: 'string', minLength: 3 }, description: { type: 'string', minLength: 10 }, status: { type: 'string', enum: ['draft', 'published'] }
        }
      },
      ContentUpdate: {
        type: 'object', minProperties: 1, properties: {
          title: { type: 'string', minLength: 1 }, description: { type: 'string', minLength: 1 }, status: { type: 'string', enum: ['draft', 'published'] }
        }
      },
      Document: {
        type: 'object', properties: {
          _id: { type: 'string' }, employeeId: { type: 'string' }, documentType: { type: 'string' },
          originalFileName: { type: 'string' }, fileSize: { type: 'integer' }, mimeType: { type: 'string' },
          uploadedBy: { type: 'string' }, status: { type: 'string', enum: ['active', 'archived'] },
          ocrStatus: { type: 'string', enum: ['pending', 'completed', 'failed', 'not_supported'] },
          ocrConfidence: { type: 'number', nullable: true }, ocrProcessedAt: { type: 'string', format: 'date-time', nullable: true },
          ocrFields: { type: 'object', additionalProperties: true }, createdAt: { type: 'string', format: 'date-time' }
        }
      },
      DocumentUpload: {
        type: 'object', required: ['file', 'employeeId', 'documentType'], properties: {
          file: { type: 'string', format: 'binary' }, employeeId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          documentType: { type: 'string', enum: ['Aadhar', 'PAN', 'Passport', 'Resume', 'Offer Letter', 'Joining Letter', 'Experience Letter', 'Salary Slip', 'Other'] }
        }
      },
      DocumentUpdate: {
        type: 'object', properties: {
          file: { type: 'string', format: 'binary' },
          documentType: { type: 'string', enum: ['Aadhar', 'PAN', 'Passport', 'Resume', 'Offer Letter', 'Joining Letter', 'Experience Letter', 'Salary Slip', 'Other'] },
          status: { type: 'string', enum: ['active', 'archived'] }
        }
      }
    }
  }
};
