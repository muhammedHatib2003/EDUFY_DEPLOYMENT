import mongoose from 'mongoose'

const CourseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    thumbnail: { type: String, default: null },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    teacherClerkId: { type: String, required: true },
    teacherName: { type: String, required: true },
    joinType: { type: String, enum: ['free', 'code'], required: true },
    joinCode: { type: String }, // required when joinType === 'code'
  },
  { timestamps: true }
)

CourseSchema.index({ title: 'text', description: 'text' })

const Course = mongoose.model('Course', CourseSchema)
export default Course
