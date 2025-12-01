import mongoose from 'mongoose'

const AssignmentSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    title: { type: String, required: true },
    description: { type: String },
    dueDate: { type: Date },
    files: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

const Assignment = mongoose.model('Assignment', AssignmentSchema)
export default Assignment

