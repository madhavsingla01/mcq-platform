import mongoose from 'mongoose';

const adminRoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    permissions: [{
      type: String,
      trim: true,
    }],
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const DEFAULT_ROLES = [
  {
    name: 'Super Admin',
    slug: 'super_admin',
    description: 'Unrestricted operational authority, role assignments, security controls.',
    permissions: [
      'manage_users',
      'suspend_users',
      'manage_content',
      'restrict_content',
      'manage_reports',
      'view_audit_logs',
      'system_health',
      'manage_roles',
      'manage_categories',
    ],
    isSystem: true,
  },
  {
    name: 'Moderator',
    slug: 'moderator',
    description: 'Content review, user reports queue, and public discovery restrictions.',
    permissions: [
      'manage_content',
      'restrict_content',
      'manage_reports',
      'suspend_users',
      'view_audit_logs',
    ],
    isSystem: true,
  },
  {
    name: 'Content Manager',
    slug: 'content_manager',
    description: 'Category taxonomy, featured quizzes, challenge scheduling and curations.',
    permissions: [
      'manage_content',
      'manage_categories',
    ],
    isSystem: true,
  },
  {
    name: 'Support',
    slug: 'support',
    description: 'User inquiry lookups, non-destructive troubleshooting and guidance.',
    permissions: [
      'manage_users',
      'manage_reports',
    ],
    isSystem: true,
  },
];

const AdminRole = mongoose.model('AdminRole', adminRoleSchema);
export default AdminRole;
