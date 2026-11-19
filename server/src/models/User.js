const { Schema, model } = require('mongoose');
const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 200 },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: { createdAt: true, updatedAt: false } });
module.exports = model('User', userSchema);
