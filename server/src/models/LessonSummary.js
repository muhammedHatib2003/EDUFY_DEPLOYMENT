import mongoose from 'mongoose'

const LessonSummarySchema = new mongoose.Schema(
  {
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true },
    audioUrl: { type: String, required: true, trim: true },
    transcript: { type: String, required: true },
    summary: { type: String, required: true },
  },
  { timestamps: true }
)

const LessonSummary = mongoose.model('LessonSummary', LessonSummarySchema)
export default LessonSummary
