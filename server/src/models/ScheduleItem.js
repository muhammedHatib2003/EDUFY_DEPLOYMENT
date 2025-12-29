import mongoose from 'mongoose'

const ScheduleItemSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['exam', 'assignment', 'announcement'], default: 'announcement' },
    description: { type: String },
    date: { type: Date, required: true, index: true },
    createdBy: { type: String, required: true }, // Clerk user id
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

const ScheduleItem = mongoose.model('ScheduleItem', ScheduleItemSchema)
export default ScheduleItem
