import mongoose from 'mongoose'

const QuestionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['mcq', 'boolean'], default: 'mcq' },
    text: { type: String, required: true },
    options: { type: [String], default: [] }, // for mcq
    correct: { type: mongoose.Schema.Types.Mixed }, // number (mcq index) or boolean
    points: { type: Number, default: 1 },
  },
  { _id: false }
)

const QuizSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    title: { type: String, required: true },
    description: { type: String },
    dueDate: { type: Date },
    questions: { type: [QuestionSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

const Quiz = mongoose.model('Quiz', QuizSchema)
export default Quiz

