const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  HR_MANAGER: 'hr_manager',
  MANAGER: 'manager',
  EMPLOYEE: 'employee'
};

const ROLE_ALIASES = {
  [ROLES.SUPER_ADMIN]: [ROLES.SUPER_ADMIN],
  [ROLES.ADMIN]: [ROLES.ADMIN],
  [ROLES.HR_MANAGER]: [ROLES.HR_MANAGER, 'hr'],
  [ROLES.MANAGER]: [ROLES.MANAGER],
  [ROLES.EMPLOYEE]: [ROLES.EMPLOYEE]
};

const ALL_ROLES = Object.values(ROLES);

const normalizeRole = (role) => {
  const aliasList = ROLE_ALIASES[role] || [role];
  return aliasList.filter(Boolean);
};

const isRoleAllowed = (userRole, allowedRoles = []) => {
  const allowedSet = new Set(
    allowedRoles.flatMap((role) => normalizeRole(role))
  );

  return allowedSet.has(userRole);
};

module.exports = {
  ROLES,
  ALL_ROLES,
  ROLE_ALIASES,
  normalizeRole,
  isRoleAllowed
};
