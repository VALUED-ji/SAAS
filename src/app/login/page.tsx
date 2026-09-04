"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getAuthorizedRedirectPath } from "@/lib/menuAccess";

const REMEMBER_LOGIN_KEY = "zxgj_remembered_login";
const SESSION_EXPIRED_STORAGE_KEY = "zxgj_session_expired_message";
const SESSION_EXPIRED_MESSAGE = "登录已过期，请重新登录";
const loginInputClass =
  "h-11 w-full rounded-2xl border border-[#2b241c]/15 bg-white/75 px-4 text-sm text-[#211b15] outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition-all duration-300 placeholder:text-[#8d8579] focus:border-[#B88746]/80 focus:ring-4 focus:ring-[#B88746]/15";
const loginHeroImage =
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=2200&q=85";

function encodeRememberedLogin(username: string, password: string) {
  return window.btoa(unescape(encodeURIComponent(JSON.stringify({ username, password }))));
}

function decodeRememberedLogin(value: string) {
  try {
    const data = JSON.parse(decodeURIComponent(escape(window.atob(value)))) as { username?: unknown; password?: unknown };
    return {
      username: typeof data.username === "string" ? data.username : "",
      password: typeof data.password === "string" ? data.password : "",
    };
  } catch {
    return null;
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const remembered = decodeRememberedLogin(localStorage.getItem(REMEMBER_LOGIN_KEY) || "");
    if (!remembered) return;
    setUsername(remembered.username);
    setPassword(remembered.password);
    setRemember(Boolean(remembered.username || remembered.password));
  }, []);

  useEffect(() => {
    const sessionMessage = sessionStorage.getItem(SESSION_EXPIRED_STORAGE_KEY);
    if (sessionMessage) {
      setError(sessionMessage);
      sessionStorage.removeItem(SESSION_EXPIRED_STORAGE_KEY);
      return;
    }
    if (searchParams.get("reason") === "session-expired") {
      setError(SESSION_EXPIRED_MESSAGE);
    }
  }, [searchParams]);

  const handleRememberChange = (checked: boolean) => {
    setRemember(checked);
    if (!checked) localStorage.removeItem(REMEMBER_LOGIN_KEY);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(username, password);
      if (remember) {
        localStorage.setItem(REMEMBER_LOGIN_KEY, encodeRememberedLogin(username.trim(), password));
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
      }
      const redirect = String(searchParams.get("redirect") || "").trim();
      const requestedPath = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "";
      router.push(getAuthorizedRedirectPath(user, requestedPath));
    } catch (err: any) {
      setError(err.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="relative flex min-h-screen overflow-hidden bg-[#171411] bg-cover bg-center px-5 py-8 sm:px-8 lg:items-center lg:justify-end lg:px-[8vw]"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(10,8,6,0.55), rgba(10,8,6,0.08) 48%, rgba(10,8,6,0.38)), url("${loginHeroImage}")`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(255,255,255,0.18),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.22))]" />
      <div className="absolute left-8 top-8 z-10 flex items-center gap-3.5 text-[#fff7e8] sm:left-12 sm:top-12 lg:left-14 lg:top-12">
        <img src="/brand/login-logo.png" alt="着急信息 Logo" className="h-12 w-12 object-contain drop-shadow-[0_5px_16px_rgba(0,0,0,0.24)] sm:h-14 sm:w-14" />
        <span className="text-[17px] font-semibold tracking-[0.02em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.28)] sm:text-[19px]">着急信息</span>
      </div>

      <section className="relative z-10 my-auto w-full max-w-[390px] rounded-[28px] border border-[#2a231b]/10 bg-[#fffcf7]/95 p-7 shadow-[0_24px_70px_rgba(37,29,20,0.20),inset_0_1px_0_rgba(255,255,255,0.86)] backdrop-blur sm:p-8 lg:mr-0">
        <div className="mb-7">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#B88746]">Renovation Ops</div>
          <h1 className="mt-3 text-[30px] font-black leading-tight tracking-[-0.01em] text-[#211b15]">欢迎回来</h1>
          <p className="mt-2 text-sm leading-6 text-[#756f66]">登录您的装修管家管理平台</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-100 bg-red-50/90 px-4 py-2.5 text-sm text-red-600">{error}</div>
          )}

          <div>
            <label className="mb-2 block text-xs font-bold text-[#756f66]">手机号 / 账号</label>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={loginInputClass}
              placeholder="请输入账号"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold text-[#756f66]">密码</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${loginInputClass} pr-10`}
                placeholder="请输入密码"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 rounded-full p-1 text-[#8d8579] transition hover:bg-[#2b241c]/5 hover:text-[#211b15]"
                style={{ transform: "translateY(-50%)" }}
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 text-[#756f66]">
              <input type="checkbox" checked={remember} onChange={(event) => handleRememberChange(event.target.checked)} className="h-4 w-4 rounded border-[#2b241c]/20 accent-[#171411]" />
              记住密码
            </label>
            <a href="#" className="text-[#756f66] transition hover:text-[#211b15]">
              忘记密码？
            </a>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="group inline-flex h-12 w-full items-center justify-between rounded-full border border-[#171411] bg-[#171411] py-1.5 pl-5 pr-1.5 text-sm font-extrabold text-white shadow-[0_16px_34px_rgba(24,21,18,0.23)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_50px_rgba(24,21,18,0.28)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "登录中..." : "登录"}
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/14 text-lg leading-none transition-transform duration-300 group-hover:translate-x-0.5">
              →
            </span>
          </button>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
