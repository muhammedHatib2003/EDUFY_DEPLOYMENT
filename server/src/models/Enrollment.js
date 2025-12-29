import mongoose from 'mongoose'

const EnrollmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  },
  { timestamps: true }
)

EnrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true })

const Enrollment = mongoose.model('Enrollment', EnrollmentSchema)
export default Enrollment
