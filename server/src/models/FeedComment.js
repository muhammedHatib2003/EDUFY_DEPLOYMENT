import mongoose from 'mongoose'

const FeedCommentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'FeedPost', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 280 },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'FeedComment', default: null, index: true },
    voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    votesCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

const FeedComment = mongoose.model('FeedComment', FeedCommentSchema)
export default FeedComment
