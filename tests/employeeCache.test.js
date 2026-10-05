jest.mock('../models/employeeModel', () => ({
  find: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn()
}));

jest.mock('../utils/redisClient', () => ({
  redisClient: {
    isReady: true,
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    scanIterator: jest.fn()
  }
}));

const Employee = require('../models/employeeModel');
const { redisClient } = require('../utils/redisClient');
const employeeService = require('../services/employeeService');

const admin = { _id: 'admin-id', role: 'admin', email: 'admin@example.com' };
const employeeList = [{ _id: 'employee-id', email: 'employee@example.com' }];

describe('employee list Redis cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.isReady = true;
    redisClient.scanIterator.mockImplementation(async function* scanKeys() {
      yield 'employees:list:all';
      yield 'employees:list:user:employee%40example.com';
    });
    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockResolvedValue('OK');
  });

  test('loads from MongoDB on a miss and caches the list for 60 seconds', async () => {
    Employee.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue(employeeList)
    });

    await expect(employeeService.getEmployees(admin)).resolves.toBe(employeeList);

    expect(redisClient.get).toHaveBeenCalledWith('employees:list:all');
    expect(Employee.find).toHaveBeenCalledWith({});
    expect(redisClient.set).toHaveBeenCalledWith(
      'employees:list:all',
      JSON.stringify(employeeList),
      { EX: 60 }
    );
  });

  test('returns cached list data without querying MongoDB on a hit', async () => {
    redisClient.get.mockResolvedValue(JSON.stringify(employeeList));

    await expect(employeeService.getEmployees(admin)).resolves.toEqual(employeeList);

    expect(Employee.find).not.toHaveBeenCalled();
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  test('invalidates all employee list entries after create, update, and delete', async () => {
    const employeeId = '507f1f77bcf86cd799439011';
    const updatedEmployee = { _id: employeeId };
    Employee.create.mockResolvedValue(updatedEmployee);
    Employee.findOneAndUpdate.mockResolvedValue(updatedEmployee);
    Employee.findOneAndDelete.mockResolvedValue({ files: [] });

    await employeeService.createEmployee({ name: 'Created' }, admin);
    await employeeService.updateEmployee(employeeId, { name: 'Updated' }, admin);
    await employeeService.deleteEmployee(employeeId, admin);

    expect(redisClient.scanIterator).toHaveBeenCalledTimes(3);
    expect(redisClient.del).toHaveBeenCalledTimes(6);
  });
});