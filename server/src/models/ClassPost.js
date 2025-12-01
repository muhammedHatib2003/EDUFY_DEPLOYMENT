import mongoose from 'mongoose'

const ClassPostSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    authorId: { type: String, required: true }, // Clerk id
    text: { type: String },
    attachments: [
      {
        url: { type: String, required: true },
        // 'image' | 'video' (keep minimal; client ensures correctness)
        type: { type: String, enum: ['image', 'video'], required: true },
      },
    ],
    likes: { type: [String], default: [] }, // Clerk ids who liked
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

const ClassPost = mongoose.model('ClassPost', ClassPostSchema)
export default ClassPost
