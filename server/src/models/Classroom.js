import mongoose from 'mongoose'

const ClassroomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    joinCode: { type: String, index: true },
    teacherId: { type: String, required: true }, // Clerk user id
    memberIds: { type: [String], default: [] }, // Clerk user ids
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

const Classroom = mongoose.model('Classroom', ClassroomSchema)
export default Classroom

