import mongoose from 'mongoose'

const ReplySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 280 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
)

const QuestionAnswerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 280 },
    voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    votesCount: { type: Number, default: 0 },
    replies: [ReplySchema],
  },
  { timestamps: true }
)

const QuestionAnswer = mongoose.model('QuestionAnswer', QuestionAnswerSchema)
export default QuestionAnswer
