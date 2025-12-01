import mongoose from 'mongoose'

const MediaSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['image', 'video'], required: true },
    data: { type: String, required: true },
    mimeType: { type: String },
  },
  { _id: false }
)

const QuestionSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 150 },
    details: { type: String, required: true, maxlength: 800 },
    tags: [{ type: String }],
    attachments: [MediaSchema],
    votesCount: { type: Number, default: 0 },
    voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    answersCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

const Question = mongoose.model('Question', QuestionSchema)
export default Question
