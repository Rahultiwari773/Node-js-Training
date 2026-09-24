const express = require('express');
const authenticate = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const {
  salaryIdValidation,
  createSalaryValidation,
  updateSalaryValidation
} = require('../validators/salaryValidators');
const {
  getSalaries,
  getSalaryById,
  createSalary,
  updateSalary,
  deleteSalary
} = require('../controllers/salaryController');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('admin', 'hr', 'employee'), getSalaries);
router.get('/:id', salaryIdValidation, validate, authorize('admin', 'hr', 'employee'), getSalaryById);
router.post('/', createSalaryValidation, validate, authorize('admin', 'hr'), createSalary);
router.put('/:id', salaryIdValidation, updateSalaryValidation, validate, authorize('admin', 'hr'), updateSalary);
router.delete('/:id', salaryIdValidation, validate, authorize('admin', 'hr'), deleteSalary);

module.exports = router;
