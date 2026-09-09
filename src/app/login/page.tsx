"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getAuthorizedRedirectPath } from "@/lib/menuAccess";

const REMEMBER_LOGIN_KEY = "zxgj_remembered_login";
const SESSION_EXPIRED_STORAGE_KEY = "zxgj_session_expired_message";
const SESSION_EXPIRED_MESSAGE = "登录已过期，请重新登录";
const loginHeroImage = "/brand/login-palace-c.png";

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
  const { login, user, loading: authLoading, isAuthenticated } = useAuth();
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

  useEffect(() => {
    if (authLoading || !isAuthenticated || !user) return;
    const redirect = String(searchParams.get("redirect") || "").trim();
    const requestedPath = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "";
    router.replace(getAuthorizedRedirectPath(user, requestedPath));
  }, [authLoading, isAuthenticated, router, searchParams, user]);

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

  if (authLoading || (isAuthenticated && user)) {
    return (
      <main
        className="zxgj-login-page"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(65,13,9,.34) 0%, rgba(65,13,9,.04) 45%, rgba(255,251,239,.08) 100%), url("${loginHeroImage}")`,
        }}
      >
        <LoginStyles />
        <Loader2 className="zxgj-login-loading" />
      </main>
    );
  }

  return (
    <main
      className="zxgj-login-page"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(65,13,9,.34) 0%, rgba(65,13,9,.04) 45%, rgba(255,251,239,.08) 100%), url("${loginHeroImage}")`,
      }}
    >
      <LoginStyles />
      <section className="zxgj-login-shell" aria-label="账号登录">
        <div className="zxgj-login-panel">
          <div className="zxgj-login-panel-inner">
            <div className="zxgj-login-head">
              <div className="zxgj-login-kicker">Rose will bloom ail the time.</div>
              <div className="zxgj-login-title">
                <img src="/brand/login-logo.png" alt="着急信息 Logo" />
                <span aria-hidden="true" />
                <strong>着急信息，欢迎您</strong>
              </div>
              <p>登录装修管理平台</p>
            </div>

            <form onSubmit={handleLogin} className="zxgj-login-form">
              {error && (
                <div className="zxgj-login-error">{error}</div>
              )}

              <div>
                <label className="zxgj-login-label">手机号 / 账号</label>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="zxgj-login-input"
                  placeholder="请输入账号"
                />
              </div>
              <div>
                <label className="zxgj-login-label">密码</label>
                <div className="zxgj-login-password">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="zxgj-login-input zxgj-login-input-password"
                    placeholder="请输入密码"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="zxgj-login-eye"
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>
              <div className="zxgj-login-row">
                <label>
                  <input type="checkbox" checked={remember} onChange={(event) => handleRememberChange(event.target.checked)} />
                  记住密码
                </label>
                <a href="#">
                  忘记密码？
                </a>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="zxgj-login-submit"
              >
                <span>
                  {loading ? <Loader2 /> : null}
                  {loading ? "登录中..." : "登录"}
                </span>
                <i>
                  →
                </i>
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

function LoginStyles() {
  return (
    <style jsx global>{`
      :root {
        --zxgj-login-ease: cubic-bezier(.32,.72,0,1);
      }

      @keyframes zxgj-login-rise {
        from {
          opacity: 0;
          transform: translate(-50%, calc(-50% + 34px)) scale(.985);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      .zxgj-login-page {
        position: relative;
        min-height: 100dvh;
        overflow: hidden;
        background-color: #2b1712;
        background-size: cover;
        background-position: center;
        color: #2b1f19;
        font-family: "Geist", "Plus Jakarta Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      .zxgj-login-loading {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 32px;
        height: 32px;
        color: #fff8e7;
        transform: translate(-50%, -50%);
      }

      .zxgj-login-shell {
        position: absolute;
        z-index: 2;
        left: 50%;
        top: 50%;
        width: min(720px, calc(100vw - 72px));
        min-height: 410px;
        transform: translate(-50%, -50%);
        border: 1px solid rgba(255,244,221,.68);
        border-radius: 32px;
        background: rgba(255,245,219,.26);
        padding: 8px;
        box-shadow: 0 32px 86px rgba(82,24,17,.2);
        opacity: 0;
        animation: zxgj-login-rise .82s var(--zxgj-login-ease) .08s forwards;
      }

      .zxgj-login-panel {
        display: flex;
        min-height: 394px;
        flex-direction: column;
        justify-content: center;
        border-radius: 24px;
        background: rgba(255,249,235,.88);
        padding: 38px 48px;
        color: #2b1f19;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.78);
      }

      .zxgj-login-panel-inner {
        width: 100%;
        max-width: 470px;
        margin: 0 auto;
      }

      .zxgj-login-head {
        margin-bottom: 28px;
      }

      .zxgj-login-kicker {
        display: inline-flex;
        height: 26px;
        align-items: center;
        border-radius: 999px;
        background: rgba(154,51,41,.1);
        padding: 0 12px;
        color: #a83a31;
        font-family: "凌慧体-简", "LingWai SC", "手札体-简", "Apple Chancery", cursive;
        font-size: 18px;
        font-style: normal;
        font-weight: 700;
        letter-spacing: .02em;
      }

      .zxgj-login-title {
        display: flex;
        align-items: center;
        gap: 14px;
        margin: 18px 0 10px;
      }

      .zxgj-login-title img {
        width: 42px;
        height: 42px;
        object-fit: contain;
        filter: drop-shadow(0 8px 18px rgba(82,24,17,.12));
      }

      .zxgj-login-title span {
        display: block;
        width: 1px;
        height: 38px;
        background: rgba(43,31,25,.62);
      }

      .zxgj-login-title strong {
        color: #2b1f19;
        font-size: 26px;
        font-weight: 900;
        line-height: 1;
        letter-spacing: 0;
      }

      .zxgj-login-head p {
        margin: 0;
        color: #75665c;
        font-size: 14px;
        line-height: 1.7;
      }

      .zxgj-login-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .zxgj-login-error {
        border: 1px solid rgba(254, 202, 202, .9);
        border-radius: 16px;
        background: rgba(254, 242, 242, .9);
        padding: 10px 16px;
        color: #dc2626;
        font-size: 14px;
      }

      .zxgj-login-label {
        display: block;
        margin-bottom: 8px;
        color: #4a3129;
        font-size: 13px;
        font-weight: 780;
      }

      .zxgj-login-input {
        width: 100%;
        height: 52px;
        border: 1px solid rgba(83,50,31,.13);
        border-radius: 15px;
        outline: 0;
        background: rgba(255,255,255,.62);
        padding: 0 16px;
        color: #2b1f19;
        font: inherit;
        font-size: 14px;
        box-shadow: none;
        transition: border-color .55s var(--zxgj-login-ease), background .55s var(--zxgj-login-ease), box-shadow .55s var(--zxgj-login-ease);
      }

      .zxgj-login-input:focus {
        border-color: rgba(154,51,41,.46);
        background: rgba(255,255,255,.92);
        box-shadow: 0 0 0 4px rgba(154,51,41,.12);
      }

      .zxgj-login-input::placeholder {
        color: #aa9d91;
      }

      .zxgj-login-password {
        position: relative;
      }

      .zxgj-login-input-password {
        padding-right: 44px;
      }

      .zxgj-login-eye {
        position: absolute;
        right: 12px;
        top: 50%;
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: #aa9d91;
        cursor: pointer;
        transform: translateY(-50%);
        transition: background .35s var(--zxgj-login-ease), color .35s var(--zxgj-login-ease);
      }

      .zxgj-login-eye:hover {
        background: rgba(83,50,31,.05);
        color: #2b1f19;
      }

      .zxgj-login-eye svg {
        width: 16px;
        height: 16px;
      }

      .zxgj-login-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 5px 0 8px;
        color: #75665c;
        font-size: 13px;
      }

      .zxgj-login-row label {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;
      }

      .zxgj-login-row input {
        width: auto;
        height: auto;
        accent-color: #9a3329;
      }

      .zxgj-login-row a {
        color: inherit;
        text-decoration: none;
      }

      .zxgj-login-submit {
        display: flex;
        width: 100%;
        height: 54px;
        align-items: center;
        justify-content: space-between;
        border: 0;
        border-radius: 999px;
        background: #8f2d25;
        padding: 5px 7px 5px 22px;
        color: #fff;
        font-size: 14px;
        font-weight: 850;
        cursor: pointer;
        transition: transform .55s var(--zxgj-login-ease), filter .55s var(--zxgj-login-ease);
      }

      .zxgj-login-submit:hover {
        transform: translateY(-1px);
        filter: saturate(1.08) brightness(.96);
      }

      .zxgj-login-submit:disabled {
        cursor: not-allowed;
        opacity: .6;
      }

      .zxgj-login-submit span {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .zxgj-login-submit span svg {
        width: 16px;
        height: 16px;
      }

      .zxgj-login-submit i {
        display: grid;
        width: 38px;
        height: 38px;
        place-items: center;
        border-radius: 50%;
        background: rgba(255,255,255,.17);
        font-style: normal;
        transition: transform .55s var(--zxgj-login-ease), background .55s var(--zxgj-login-ease);
      }

      .zxgj-login-submit:hover i {
        transform: translateX(2px);
        background: rgba(255,255,255,.24);
      }

      @media (max-width: 860px) {
        .zxgj-login-page {
          overflow: auto;
          padding: 96px 16px 24px;
        }

        .zxgj-login-shell {
          position: relative;
          left: auto;
          top: auto;
          width: 100%;
          min-height: auto;
          margin: 0 auto;
          transform: none;
          animation-name: zxgj-login-rise-mobile;
        }

        .zxgj-login-panel {
          min-height: 416px;
          padding: 34px;
        }
      }

      @keyframes zxgj-login-rise-mobile {
        from {
          opacity: 0;
          transform: translateY(34px) scale(.985);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    `}</style>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
