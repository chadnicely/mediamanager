import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
)

// Notes & notebooks are keyed by a client-generated id (cid) per user, so every
// device references the same record. updatedAt/createdAt are millisecond numbers
// (matching the client), used for last-write-wins sync.
const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  cid: { type: String, required: true },
  notebookId: { type: String, default: 'default' },
  title: { type: String, default: '' },
  body: { type: String, default: '' },
  favorite: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  createdAt: { type: Number, default: 0 },
  updatedAt: { type: Number, default: 0, index: true }
})
noteSchema.index({ userId: 1, cid: 1 }, { unique: true })

const notebookSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  cid: { type: String, required: true },
  name: { type: String, default: '' },
  deleted: { type: Boolean, default: false },
  createdAt: { type: Number, default: 0 },
  updatedAt: { type: Number, default: 0, index: true }
})
notebookSchema.index({ userId: 1, cid: 1 }, { unique: true })

// Reuse already-compiled models on warm serverless invocations.
export const User = mongoose.models.User || mongoose.model('User', userSchema)
export const Note = mongoose.models.Note || mongoose.model('Note', noteSchema)
export const Notebook = mongoose.models.Notebook || mongoose.model('Notebook', notebookSchema)
