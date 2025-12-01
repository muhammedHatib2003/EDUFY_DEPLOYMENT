export default function ClassroomCard({ classroom, onOpen }) {
  return (
    <div className="card bg-base-100 shadow-sm hover:shadow-md transition cursor-pointer" onClick={() => onOpen?.(classroom)}>
      <div className="card-body">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{classroom.name}</div>
          <div className="badge badge-ghost">{classroom.memberIds?.length || 1} members</div>
        </div>
        {classroom.description && (
          <div className="text-sm opacity-80 line-clamp-2">{classroom.description}</div>
        )}
        <div className="text-xs opacity-60">Code: {classroom.joinCode}</div>
      </div>
    </div>
  )
}

