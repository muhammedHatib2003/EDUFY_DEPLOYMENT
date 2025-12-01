import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { Pencil, Check, X } from "lucide-react";

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
  const [form, setForm] = useState({ firstName: "", lastName: "", age: "", handle: "", bio: "" });
  const [photoFile, setPhotoFile] = useState(null);

  useEffect(() => {
    const run = async () => {
      const token = await getToken();
      const http = api.authedApi(token);
      const { data } = await http.get("/api/users/me");
      setMe(data.user);
      setLoading(false);
      if (data.user && !data.user.onboarded) navigate("/onboarding");
    };
    run().catch(() => setLoading(false));
  }, [getToken, navigate]);

  if (loading) return <div className="p-4">Loading...</div>;
  if (!me) return <div className="p-4">Profile not found</div>;

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
        await user.update({ firstName: form.firstName, lastName: form.lastName }).catch(() => {});
        if (photoFile) await user.setProfileImage({ file: photoFile }).catch(() => {});
      }

      const token = await getToken();
      const http = api.authedApi(token);
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        age: form.age === "" ? undefined : Number(form.age),
        handle: form.handle.trim(),
        bio: form.bio.trim(),
      };

      const { data } = await http.patch("/api/users/me", payload);
      setMe(data.user);
      setSuccess("Profile updated");
      setEditing(false);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-10">
      <div className="bg-base-100/60 backdrop-blur rounded-xl shadow-xl border p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-6">
          <div className="avatar">
            <div className="w-28 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
              <img src={user?.imageUrl} alt="avatar" />
            </div>
          </div>

          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {[me.firstName, me.lastName].filter(Boolean).join(" ") || "Unnamed"}
            </h1>
            <p className="opacity-70">@{me.handle || "-"}</p>
          </div>

          {!editing && (
            <button className="btn btn-primary btn-sm" onClick={startEdit}>
              <Pencil size={16} />
              Edit
            </button>
          )}
        </div>

        {!editing ? (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <Info label="Username" value={me.handle} />
              <Info label="Name" value={[me.firstName, me.lastName].join(" ")} />
              <Info label="Role" value={me.role} />
              <Info label="Age" value={me.age} />
            </div>

            {me.bio && (
              <div>
                <div className="font-semibold mb-1">Bio</div>
                <p className="opacity-80 whitespace-pre-wrap">{me.bio}</p>
              </div>
            )}
          </>
        ) : (
          <form onSubmit={save} className="space-y-3">
            {error && <div className="alert alert-error text-sm">{error}</div>}
            {success && <div className="alert alert-success text-sm">{success}</div>}

            <div className="form-control">
              <label className="label"><span className="label-text">Profile Photo</span></label>
              <input type="file" className="file-input file-input-bordered" accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="First Name" name="firstName" value={form.firstName} onChange={onChange} required />
              <Input label="Last Name" name="lastName" value={form.lastName} onChange={onChange} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Age" name="age" type="number" value={form.age} onChange={onChange} />
              <Input label="Role" readOnly value={me.role} helper="Role cannot be changed" />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">Username</span></label>
              <div className="input input-bordered flex items-center">
                <span className="opacity-70 mr-1">@</span>
                <input name="handle" className="flex-1 bg-transparent outline-none"
                  value={form.handle} onChange={onChange} required />
              </div>
            </div>

            <Textarea label="Bio" name="bio" value={form.bio} onChange={onChange} />

            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                <X size={16} /> Cancel
              </button>
              <button type="submit" className={`btn btn-primary ${saving ? "loading" : ""}`} disabled={saving}>
                <Check size={16} /> Save
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// UI helpers
function Info({ label, value }) {
  return (
    <div className="p-4 bg-base-200 rounded-lg">
      <div className="text-sm opacity-60">{label}</div>
      <div className="font-medium">{value ?? "-"}</div>
    </div>
  );
}

function Input({ label, helper, ...props }) {
  return (
    <div className="form-control">
      <label className="label"><span className="label-text">{label}</span></label>
      <input {...props} className="input input-bordered" />
      {helper && <label className="label text-xs opacity-60">{helper}</label>}
    </div>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div className="form-control">
      <label className="label"><span className="label-text">{label}</span></label>
      <textarea {...props} rows={3} className="textarea textarea-bordered" />
    </div>
  );
}
