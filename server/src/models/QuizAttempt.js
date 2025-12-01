import mongoose from 'mongoose'

const QuizAttemptSchema = new mongoose.Schema(
  {
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    studentId: { type: String, required: true }, // Clerk user id
    answers: { type: [mongoose.Schema.Types.Mixed], default: [] }, // number (mcq index) or boolean
    score: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

QuizAttemptSchema.index({ quizId: 1, studentId: 1 }, { unique: true })

const QuizAttempt = mongoose.model('QuizAttempt', QuizAttemptSchema)
export default QuizAttempt

