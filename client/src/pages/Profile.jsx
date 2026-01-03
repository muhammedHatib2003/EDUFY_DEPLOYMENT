import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { authedApi } from "../lib/api.js";
import { Pencil, Check, X, Camera, UserCircle } from "lucide-react";

export default function Profile() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ 
    firstName: "", 
    lastName: "", 
    age: "", 
    handle: "", 
    bio: "" 
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  useEffect(() => {
    const run = async () => {
      const http = await authedApi(getToken);
      const { data } = await http.get("/users/me");
      setMe(data.user);
      setPhotoPreview(user?.imageUrl);
      setLoading(false);
      if (data.user && !data.user.onboarded) navigate("/onboarding");
    };
    run().catch(() => setLoading(false));
  }, [getToken, navigate, user?.imageUrl]);

  // Handle photo preview
  useEffect(() => {
    if (photoFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(photoFile);
    }
  }, [photoFile]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="loading loading-spinner loading-lg text-primary"></div>
        <p className="mt-4 text-gray-600">Loading profile...</p>
      </div>
    </div>
  );
  
  if (!me) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <UserCircle className="w-16 h-16 mx-auto text-gray-400" />
        <p className="mt-4 text-gray-600">Profile not found</p>
      </div>
    </div>
  );

  const startEdit = () => {
    setForm({
      firstName: me.firstName || "",
      lastName: me.lastName || "",
      age: me.age ?? "",
      handle: me.handle ? me.handle.replace(/^@/, "") : "",
      bio: me.bio || "",
    });
    setEditing(true);
    setError("");
    setSuccess("");
  };

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (user) {
        await user.update({ 
          firstName: form.firstName, 
          lastName: form.lastName 
        }).catch(() => {});
        
        if (photoFile) {
          await user.setProfileImage({ file: photoFile }).catch(() => {});
        }
      }

      const http = await authedApi(getToken);
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        age: form.age === "" ? undefined : Number(form.age),
        handle: form.handle.trim(),
        bio: form.bio.trim(),
        avatarUrl: user?.imageUrl || me?.avatarUrl,
      };

      const { data } = await http.patch("/users/me", payload);
      setMe(data.user);
      setSuccess("Profile updated successfully!");
      setTimeout(() => {
        setEditing(false);
        setSuccess("");
      }, 2000);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setPhotoPreview(user?.imageUrl);
    setPhotoFile(null);
    setError("");
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Your Profile</h1>
          <p className="mt-2 text-gray-600">Manage your personal information</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Profile Header */}
          <div className="p-6 sm:p-8 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {/* Profile Image */}
              <div className="relative">
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-white shadow-lg overflow-hidden">
                  <img 
                    src={photoPreview || user?.imageUrl || "/default-avatar.png"} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {editing && (
                  <label className="absolute -bottom-2 -right-2 cursor-pointer">
                    <div className="bg-primary text-white p-2 rounded-full shadow-lg hover:bg-primary/90 transition-colors">
                      <Camera size={18} />
                      <input 
                        type="file" 
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                      />
                    </div>
                  </label>
                )}
              </div>

              {/* Name and Actions */}
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  {[me.firstName, me.lastName].filter(Boolean).join(" ") || "Unnamed User"}
                </h2>
                <p className="text-gray-600 mt-1">@{me.handle || "username"}</p>
                
                {!editing && (
                  <button 
                    className="mt-4 btn btn-primary btn-sm sm:btn-md"
                    onClick={startEdit}
                  >
                    <Pencil size={16} />
                    Edit Profile
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 sm:p-8">
            {/* Success/Error Messages */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            
            {success && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 text-sm">{success}</p>
              </div>
            )}

            {!editing ? (
              /* View Mode */
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Info label="Username" value={me.handle ? `@${me.handle}` : "-"} />
                  <Info label="Name" value={[me.firstName, me.lastName].join(" ") || "-"} />
                  <Info label="Role" value={me.role || "-"} />
                  <Info label="Age" value={me.age || "-"} />
                </div>

                {me.bio && (
                  <div className="pt-4 border-t border-gray-100">
                    <div className="font-medium text-gray-900 mb-2">Bio</div>
                    <p className="text-gray-700 whitespace-pre-wrap">{me.bio}</p>
                  </div>
                )}
              </div>
            ) : (
              /* Edit Mode */
              <form onSubmit={save} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      First Name
                    </label>
                    <input
                      type="text"
                      name="firstName"
                      value={form.firstName}
                      onChange={onChange}
                      required
                      className="input input-bordered w-full"
                      placeholder="Enter first name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={form.lastName}
                      onChange={onChange}
                      required
                      className="input input-bordered w-full"
                      placeholder="Enter last name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Age
                    </label>
                    <input
                      type="number"
                      name="age"
                      value={form.age}
                      onChange={onChange}
                      className="input input-bordered w-full"
                      placeholder="Enter age"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Username
                    </label>
                    <div className="input input-bordered flex items-center">
                      <span className="text-gray-500 mr-2">@</span>
                      <input
                        name="handle"
                        className="flex-1 bg-transparent outline-none"
                        value={form.handle}
                        onChange={onChange}
                        required
                        placeholder="username"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bio
                  </label>
                  <textarea
                    name="bio"
                    value={form.bio}
                    onChange={onChange}
                    rows={3}
                    className="textarea textarea-bordered w-full"
                    placeholder="Tell something about yourself..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {form.bio.length}/500 characters
                  </p>
                </div>

                {/* Edit Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button 
                    type="button" 
                    className="btn btn-outline btn-sm sm:btn-md"
                    onClick={cancelEdit}
                  >
                    <X size={16} />
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className={`btn btn-primary btn-sm sm:btn-md ${saving ? "loading" : ""}`}
                    disabled={saving}
                  >
                    {!saving && <Check size={16} />}
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Mobile Edit Button */}
        {!editing && (
          <div className="sm:hidden fixed bottom-6 right-6 z-50">
            <button
              onClick={startEdit}
              className="btn btn-primary btn-circle shadow-lg w-14 h-14 text-white"
              aria-label="Edit profile"
            >
              <Pencil size={24} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Simplified Info Component
function Info({ label, value }) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="font-medium text-gray-900">{value}</div>
    </div>
  );
}
