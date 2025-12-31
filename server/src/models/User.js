import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    firstName: { type: String },
    lastName: { type: String },
    age: { type: Number },
    role: { type: String, enum: ['student', 'teacher'], default: undefined },
    handle: { type: String, unique: true, sparse: true }, // like @john123
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    onboarded: { type: Boolean, default: false },
    avatarUrl: { type: String },
    streamUserId: { type: String },
    bio: { type: String },
  },
  { timestamps: true }
)

const User = mongoose.model('User', UserSchema)
export default User
