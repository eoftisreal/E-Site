const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores (no spaces)']
    },
    password: { type: String },
    tokenVersion: { type: Number, default: 0 },
    checkoutSequence: { type: Number, default: 0 },
    name: { type: String, trim: true },
    role: { type: String, enum: ['user', 'admin', 'master_admin'], default: 'user' },
    isAdmin: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String, default: null },
    phone: { type: String, trim: true },
    address: {
      line1: { type: String, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      country: { type: String, trim: true }
    },
    masterAccessCode: { type: String, unique: true, sparse: true }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, value) {
        for (const key of ['password', 'verificationToken', 'masterAccessCode', 'tokenVersion', 'checkoutSequence']) {
          delete value[key];
        }
        return value;
      }
    }
  }
);

module.exports = mongoose.model('User', userSchema);
