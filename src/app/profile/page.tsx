"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Phone,
  RotateCcw,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/utils";
import NativeImage from "@/components/ui/NativeImage";
import LogoutConfirmDialog from "@/components/ui/LogoutConfirmDialog";
import SignatureSettings from "@/components/profile/SignatureSettings";

type Profile = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  avatar?: string | null;
  role: string;
  role_name?: string | null;
  org_unit_id?: string | null;
  org_unit_name?: string | null;
  org_unit_path?: string | null;
  company_name?: string | null;
  branch_company_name?: string | null;
  employee_no?: string | null;
  hire_date?: string | null;
  notes?: string | null;
  is_active?: number;
  created_at?: string | null;
  updated_at?: string | null;
  last_login_at?: string | null;
  last_seen_at?: string | null;
};

type PasswordForm = {
  current_password: string;
  new_password: string;
  confirm_password: string;
};

const roleFallbackLabels: Record<string, string> = {
  OWNER: "老板",
  ADMIN: "管理员",
  PM: "项目经理",
  DESIGNER: "设计师",
  FINANCE: "财务",
  SALES: "销售/跟单",
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getInitial(name?: string | null) {
  return String(name || "管").trim().slice(0, 1) || "管";
}

function evaluatePassword(password: string, profile?: Profile | null) {
  const checks = [
    { key: "length", label: "8-32 位", passed: password.length >= 8 && password.length <= 32 },
    { key: "letter", label: "包含字母", passed: /[A-Za-z]/.test(password) },
    { key: "number", label: "包含数字", passed: /\d/.test(password) },
    { key: "space", label: "首尾无空格", passed: password.length > 0 && password === password.trim() },
    { key: "profile", label: "不含姓名/手机号", passed: Boolean(password) && !password.includes(profile?.phone || "__") && !(profile?.name && password.toLowerCase().includes(profile.name.toLowerCase())) },
  ];
  const passedCount = checks.filter((item) => item.passed).length;
  const score = password ? Math.min(4, Math.max(1, Math.floor((passedCount / checks.length) * 4))) : 0;
  const label = score >= 4 ? "强" : score >= 3 ? "中" : score >= 1 ? "弱" : "未填写";
  const colorClass = score >= 4 ? "bg-emerald-500" : score >= 3 ? "bg-amber-500" : score >= 1 ? "bg-red-500" : "bg-surface-200";
  return { checks, score, label, colorClass };
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [passwordVisible, setPasswordVisible] = useState<Record<keyof PasswordForm, boolean>>({
    current_password: false,
    new_password: false,
    confirm_password: false,
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const passwordStrength = useMemo(() => evaluatePassword(passwordForm.new_password, profile), [passwordForm.new_password, profile]);
  const roleLabel = profile?.role_name || roleFallbackLabels[profile?.role || ""] || profile?.role || "-";

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "加载个人信息失败");
      setProfile(data);
    } catch (err: any) {
      setAvatarError(err.message || "加载个人信息失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const updateAvatar = async (avatar: string | null) => {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "update_avatar", avatar }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "头像保存失败");
    setProfile(data);
    window.dispatchEvent(new Event("auth:user-updated"));
    return data as Profile;
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !profile?.id) return;
    setAvatarError("");
    setAvatarMessage("");
    if (!file.type.startsWith("image/")) {
      setAvatarError("头像只能上传图片文件");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("头像图片不能超过 2MB");
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("avatar_user_id", profile.id);
      formData.append("category", "个人头像");
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) throw new Error(uploadData.message || "头像上传失败");
      await updateAvatar(uploadData.file_url || "");
      setAvatarMessage("头像已更新");
    } catch (err: any) {
      setAvatarError(err.message || "头像上传失败");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleResetAvatar = async () => {
    setAvatarError("");
    setAvatarMessage("");
    setAvatarUploading(true);
    try {
      await updateAvatar(null);
      setAvatarMessage("已恢复默认头像");
    } catch (err: any) {
      setAvatarError(err.message || "恢复默认头像失败");
    } finally {
      setAvatarUploading(false);
    }
  };

  const setPasswordField = (key: keyof PasswordForm, value: string) => {
    setPasswordForm((form) => ({ ...form, [key]: value.replace(/\s/g, "") }));
    setPasswordError("");
    setPasswordMessage("");
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError("两次输入的新密码不一致");
      return;
    }
    if (passwordStrength.checks.some((item) => !item.passed)) {
      setPasswordError("新密码还不符合安全要求");
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "change_password", ...passwordForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "密码修改失败");
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      await logout();
    } catch (err: any) {
      setPasswordError(err.message || "密码修改失败");
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-surface-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#407AFF]" />
        正在加载个人信息...
      </div>
    );
  }

  return (
    <div className="app-page-surface profile-settings-ui -m-5 flex min-h-[calc(100%+40px)] flex-col bg-[#F5F7FB] p-4 sm:p-5 lg:-m-7 lg:min-h-[calc(100%+56px)] lg:p-6">
      <header className="profile-page-header">
        <div className="min-w-0">
          <h1>个人设置</h1>
          <p>管理当前账号资料、头像、审批签名和登录密码。</p>
        </div>
        <button
          type="button"
          onClick={() => setLogoutConfirmOpen(true)}
          className="profile-logout-button"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </header>

      <div className="profile-settings-layout">
        <aside className="profile-identity-panel">
          <div className="profile-identity-heading">
            <span>账号头像</span>
            <span className={`profile-status-badge ${Number(profile?.is_active ?? 1) === 1 ? "is-active" : "is-disabled"}`}>
              {Number(profile?.is_active ?? 1) === 1 ? "正常启用" : "已停用"}
            </span>
          </div>

          <div className="profile-avatar-block">
            <div className="profile-avatar">
              {profile?.avatar ? <NativeImage src={profile.avatar} alt="个人头像预览" className="h-full w-full object-cover" loading="eager" /> : getInitial(profile?.name || user?.name)}
              <span className="profile-avatar-camera"><Camera className="h-3.5 w-3.5" /></span>
            </div>
            <div className="min-w-0 text-center">
              <p className="profile-identity-name">{profile?.name || user?.name || "当前账号"}</p>
              <p className="profile-identity-role">{roleLabel}</p>
            </div>
          </div>

          <div className="profile-identity-meta">
            <div>
              <Phone className="h-4 w-4" />
              <span>{profile?.phone || "-"}</span>
            </div>
            <div>
              <Building2 className="h-4 w-4" />
              <span>{profile?.branch_company_name || profile?.company_name || user?.companyName || "装修管家"}</span>
            </div>
          </div>

          <p className="profile-avatar-help">建议使用清晰的正方形图片，文件不超过 2MB。</p>
          {(avatarMessage || avatarError) && (
            <div className="profile-avatar-message">
              {avatarMessage && <Message tone="success" text={avatarMessage} />}
              {avatarError && <Message tone="danger" text={avatarError} />}
            </div>
          )}
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          <div className="profile-avatar-actions">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="btn-primary"
            >
              {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {avatarUploading ? "上传中..." : profile?.avatar ? "更换头像" : "上传头像"}
            </button>
            {profile?.avatar && (
              <button type="button" onClick={handleResetAvatar} disabled={avatarUploading} className="btn-secondary">
                <RotateCcw className="h-4 w-4" />
                恢复默认头像
              </button>
            )}
          </div>
        </aside>

        <main className="profile-settings-main">
          <section className="profile-settings-section">
            <div className="profile-section-header">
              <span className="profile-section-icon"><UserRound className="h-4 w-4" /></span>
              <div>
                <h2>账号资料</h2>
                <p>当前账号的身份、组织归属与使用记录。</p>
              </div>
            </div>
            <div className="profile-info-grid">
              <ProfileInfoItem label="姓名" value={profile?.name || user?.name || "-"} strong />
              <ProfileInfoItem label="登录手机号" value={profile?.phone || "-"} />
              <ProfileInfoItem label="所属公司" value={profile?.branch_company_name || profile?.company_name || user?.companyName || "装修管家"} />
              <ProfileInfoItem label="岗位角色" value={roleLabel} />
              <ProfileInfoItem label="所属组织" value={profile?.org_unit_path || profile?.org_unit_name || "未分配"} />
              <ProfileInfoItem label="员工工号" value={profile?.employee_no || "-"} />
              <ProfileInfoItem label="入职日期" value={profile?.hire_date ? formatDate(profile.hire_date) : "-"} />
              <ProfileInfoItem label="账号状态" value={Number(profile?.is_active ?? 1) === 1 ? "正常启用" : "已停用"} tone={Number(profile?.is_active ?? 1) === 1 ? "success" : "danger"} />
              <ProfileInfoItem label="最近登录" value={profile?.last_login_at ? formatDateTime(profile.last_login_at) : "暂无记录"} />
              <ProfileInfoItem label="最近活跃" value={profile?.last_seen_at ? formatDateTime(profile.last_seen_at) : "暂无记录"} />
              <ProfileInfoItem label="备注" value={profile?.notes || "暂无备注"} wide />
            </div>
          </section>

          <section className="profile-settings-section profile-signature-section">
            <SignatureSettings />
          </section>

          <section className="profile-settings-section profile-security-section">
            <div className="profile-section-header">
              <span className="profile-section-icon is-security"><KeyRound className="h-4 w-4" /></span>
              <div>
                <h2>登录密码</h2>
                <p>修改成功后将退出当前账号，请使用新密码重新登录。</p>
              </div>
            </div>
            <form onSubmit={handleChangePassword} className="profile-password-form">
              <div className="profile-password-grid">
                <PasswordInput
                  label="当前密码"
                  value={passwordForm.current_password}
                  visible={passwordVisible.current_password}
                  autoComplete="current-password"
                  onChange={(value) => setPasswordField("current_password", value)}
                  onToggle={() => setPasswordVisible((state) => ({ ...state, current_password: !state.current_password }))}
                />
                <PasswordInput
                  label="新密码"
                  value={passwordForm.new_password}
                  visible={passwordVisible.new_password}
                  autoComplete="new-password"
                  onChange={(value) => setPasswordField("new_password", value)}
                  onToggle={() => setPasswordVisible((state) => ({ ...state, new_password: !state.new_password }))}
                />
                <PasswordInput
                  label="确认新密码"
                  value={passwordForm.confirm_password}
                  visible={passwordVisible.confirm_password}
                  autoComplete="new-password"
                  onChange={(value) => setPasswordField("confirm_password", value)}
                  onToggle={() => setPasswordVisible((state) => ({ ...state, confirm_password: !state.confirm_password }))}
                />
                <button type="submit" disabled={passwordSaving} className="btn-primary profile-password-submit">
                  {passwordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {passwordSaving ? "修改中..." : "确认修改密码"}
                </button>
              </div>

              <div className="profile-password-strength">
                <div className="profile-strength-row">
                  <div className="profile-strength-label">
                    <span>密码强度</span>
                    <strong>{passwordStrength.label}</strong>
                  </div>
                  <div className="profile-strength-bars">
                    {[1, 2, 3, 4].map((item) => (
                      <span key={item} className={passwordStrength.score >= item ? passwordStrength.colorClass : "bg-surface-200"} />
                    ))}
                  </div>
                </div>
                <div className="profile-password-checks">
                  {passwordStrength.checks.map((item) => (
                    <div key={item.key}>
                      {item.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-[#9aa8bb]" />}
                      <span className={item.passed ? "text-[#34445a]" : "text-[#8a98ad]"}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {passwordMessage && <Message tone="success" text={passwordMessage} />}
              {passwordError && <Message tone="danger" text={passwordError} />}
            </form>
          </section>
        </main>
      </div>
      <LogoutConfirmDialog
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={logout}
      />
    </div>
  );
}

function ProfileInfoItem({
  label,
  value,
  strong = false,
  wide = false,
  tone = "default",
}: {
  label: string;
  value: string;
  strong?: boolean;
  wide?: boolean;
  tone?: "default" | "success" | "danger";
}) {
  const valueClass = tone === "success" ? "profile-status-badge is-active" : tone === "danger" ? "profile-status-badge is-disabled" : "profile-info-value";
  return (
    <div className={`profile-info-item ${wide ? "is-wide" : ""}`}>
      <p className="profile-info-label">{label}</p>
      <p className={`${valueClass} ${strong ? "is-strong" : ""}`} title={value}>{value}</p>
    </div>
  );
}

function PasswordInput({
  label,
  value,
  visible,
  autoComplete,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  visible: boolean;
  autoComplete: string;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#52647b]">{label}</span>
      <span className="relative block">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input-field pr-10"
          autoComplete={autoComplete}
          placeholder="请输入"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#8a98ad] transition hover:bg-[#f4f8ff] hover:text-[#407AFF]"
          aria-label={visible ? "隐藏密码" : "显示密码"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function Message({ tone, text }: { tone: "success" | "danger"; text: string }) {
  const className = tone === "success"
    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
    : "border-red-100 bg-red-50 text-red-600";
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${className}`}>
      {text}
    </div>
  );
}
