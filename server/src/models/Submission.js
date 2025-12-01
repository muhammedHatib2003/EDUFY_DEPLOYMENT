import mongoose from 'mongoose'

const SubmissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    studentId: { type: String, required: true }, // Clerk user id
    fileURL: { type: String, required: true },
    grade: { type: String }, // e.g. "85/100"
    feedback: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

SubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true })

const Submission = mongoose.model('Submission', SubmissionSchema)
export default Submission

