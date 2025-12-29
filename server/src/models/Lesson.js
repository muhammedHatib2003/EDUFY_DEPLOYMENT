import mongoose from 'mongoose'

const LessonSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    content: { type: String, default: '' }, // optional text content
    videoUrl: { type: String, required: true, trim: true }, // YouTube link
    order: { type: Number, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

const Lesson = mongoose.model('Lesson', LessonSchema)
export default Lesson
