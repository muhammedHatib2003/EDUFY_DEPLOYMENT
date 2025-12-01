import mongoose from 'mongoose'

const MediaSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['image', 'video'], required: true },
    data: { type: String, required: true },
    mimeType: { type: String },
  },
  { _id: false }
)

const FeedPostSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, maxlength: 560 },
    media: [MediaSchema],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    commentsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

const FeedPost = mongoose.model('FeedPost', FeedPostSchema)
export default FeedPost
