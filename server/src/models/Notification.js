import mongoose from 'mongoose'

const NotificationSchema = new mongoose.Schema(
  {
    // Recipient clerk id
    userId: { type: String, required: true, index: true },
    type: { type: String },
    title: { type: String, required: true },
    body: { type: String },
    data: { type: Object },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

const Notification = mongoose.model('Notification', NotificationSchema)
export default Notification

