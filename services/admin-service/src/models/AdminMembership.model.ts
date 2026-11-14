import mongoose from 'mongoose';

const adminMembershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },
    userEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    userName: {
      type: String,
      trim: true,
    },
    roleSlugs: [{
      type: String,
      lowercase: true,
      trim: true,
    }],
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

const AdminMembership = mongoose.model('AdminMembership', adminMembershipSchema);
export default AdminMembership;
