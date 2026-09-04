"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Camera, Eye, EyeOff, KeyRound, Loader2, LogOut, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import styles from "../mobile.module.css";

type Profile = Record<string, any> & {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar?: string | null;
  role?: string | null;
  role_name?: string | null;
};

type PasswordForm = { current_password: string; new_password: string; confirm_password: string };

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDateTime(value: unknown) {
  const text = String(value || "");
  if (!text) return "-";
  return text.replace("T", " ").slice(0, 16);
}

function roleLabel(profile: Profile | null) {
  const fallback: Record<string, string> = { OWNER: "老板", ADMIN: "管理员", PM: "项目经理", DESIGNER: "设计师", FINANCE: "财务", SALES: "销售/跟单" };
  return profile?.role_name || fallback[String(profile?.role || "")] || profile?.role || "-";
}

export default function MobileProfilePage() {
  const { logout } = useAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [form, setForm] = useState<PasswordForm>({ current_password: "", new_password: "", confirm_password: "" });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/profile", { headers: authHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "个人设置加载失败");
      setProfile(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "个人设置加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const updateAvatar = async (avatar: string | null) => {
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "update_avatar", avatar }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "头像保存失败");
    setProfile(payload);
    window.dispatchEvent(new Event("auth:user-updated"));
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !profile?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("头像只能上传图片");
      if (file.size > 2 * 1024 * 1024) throw new Error("头像图片不能超过 2MB");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("avatar_user_id", profile.id);
      formData.append("category", "个人头像");
      const uploadResponse = await fetch("/api/upload", { method: "POST", headers: authHeaders(), body: formData });
      const uploadPayload = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) throw new Error(uploadPayload.message || "头像上传失败");
      await updateAvatar(uploadPayload.file_url || "");
      setMessage("头像已更新");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "头像上传失败");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (form.new_password !== form.confirm_password) throw new Error("两次输入的新密码不一致");
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "change_password", ...form }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "密码修改失败");
      setMessage("密码已修改，请重新登录");
      setForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "密码修改失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.mobileProfileHero}>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <>
            <button type="button" className={styles.mobileProfileAvatar} onClick={() => fileRef.current?.click()} disabled={saving} aria-label="上传头像">
              <span className={styles.mobileProfileAvatarFrame}>
                {profile?.avatar ? <Image src={profile.avatar} alt="" fill sizes="72px" unoptimized /> : <span>{String(profile?.name || "我").slice(0, 1)}</span>}
              </span>
              <i><Camera /></i>
            </button>
            <div>
              <h1>{profile?.name || "未命名用户"}</h1>
              <p>{roleLabel(profile)} · {profile?.org_unit_name || profile?.branch_company_name || "组织未设置"}</p>
              {profile?.avatar ? <button type="button" className={styles.mobileProfileResetAvatar} onClick={() => updateAvatar(null)} disabled={saving}><RotateCcw />恢复默认</button> : null}
            </div>
          </>
        )}
        <input ref={fileRef} hidden type="file" accept="image/*" onChange={uploadAvatar} />
      </header>

      {message && <div className={styles.mobileProfileMessage}>{message}</div>}
      {error && <div className={styles.mobileProfileError}><AlertTriangle />{error}</div>}

      <main className={styles.mobileProfileContent}>
        <section className={styles.mobileProfileSection}>
          <div className={styles.mobileProfileSectionHead}><span><UserRound /></span><div><b>账号资料</b><small>接入电脑端个人设置</small></div></div>
          <div className={styles.mobileProfileInfoGrid}>
            <span><small>手机号</small><b>{profile?.phone || "-"}</b></span>
            <span><small>邮箱</small><b>{profile?.email || "-"}</b></span>
            <span><small>所属公司</small><b>{profile?.company_name || "-"}</b></span>
            <span><small>所属组织</small><b>{profile?.org_unit_path || profile?.org_unit_name || "-"}</b></span>
            <span><small>员工编号</small><b>{profile?.employee_no || "-"}</b></span>
            <span><small>最近登录</small><b>{formatDateTime(profile?.last_login_at)}</b></span>
          </div>
        </section>

        <section className={styles.mobileProfileSection}>
          <div className={styles.mobileProfileSectionHead}><span data-tone="security"><ShieldCheck /></span><div><b>账号安全</b><small>修改成功后需要重新登录</small></div></div>
          <form className={styles.mobilePasswordForm} onSubmit={changePassword}>
            {(["current_password", "new_password", "confirm_password"] as const).map((key) => (
              <label key={key}>
                <span>{key === "current_password" ? "当前密码" : key === "new_password" ? "新密码" : "确认新密码"}</span>
                <div>
                  <input type={passwordVisible ? "text" : "password"} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value.replace(/\s/g, "") }))} placeholder="请输入" />
                  <button type="button" onClick={() => setPasswordVisible((value) => !value)} aria-label="切换密码显示">{passwordVisible ? <EyeOff /> : <Eye />}</button>
                </div>
              </label>
            ))}
            <button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <KeyRound />}修改密码</button>
          </form>
        </section>

        <section className={styles.mobileProfileSection}>
          <button type="button" className={styles.mobileLogoutButton} onClick={logout}><LogOut />退出登录</button>
        </section>
      </main>
    </div>
  );
}
