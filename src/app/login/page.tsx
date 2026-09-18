"use client";

import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getAuthorizedRedirectPath } from "@/lib/menuAccess";
import "./login-critical.css";

const REMEMBER_LOGIN_KEY = "zxgj_remembered_login";
const SESSION_EXPIRED_STORAGE_KEY = "zxgj_session_expired_message";
const SESSION_EXPIRED_MESSAGE = "登录已过期，请重新登录";

function LoginVisual() {
  return (
    <aside className="zxgj-login-visual" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- Fixed login background asset. */}
      <img src="/brand/login-design-construction.jpg" alt="" loading="eager" fetchPriority="high" />
      <div className="zxgj-login-visual-wash" />
      <div className="zxgj-login-brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- Fixed branding asset. */}
        <img src="/brand/login-logo.png" alt="" width="34" height="34" />
        <span>着急信息</span>
      </div>
      <div className="zxgj-login-visual-foot">
        <div className="zxgj-login-swatches">
          <i className="swatch-wood" />
          <i className="swatch-stone" />
          <i className="swatch-metal" />
          <i className="swatch-fabric" />
        </div>
        <span>CONSTRUCTION / 01</span>
      </div>
    </aside>
  );
}

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

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const loggedInUser = await login(username, password);
      if (remember) {
        localStorage.setItem(REMEMBER_LOGIN_KEY, encodeRememberedLogin(username.trim(), password));
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
      }

      const redirect = String(searchParams.get("redirect") || "").trim();
      const requestedPath = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "";
      router.push(getAuthorizedRedirectPath(loggedInUser, requestedPath));
    } catch (loginError: unknown) {
      const message = loginError instanceof Error ? loginError.message : "登录失败";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || (isAuthenticated && user)) {
    return (
      <main className="zxgj-login-page">
        <LoginVisual />
        <section className="zxgj-login-panel zxgj-login-panel-loading">
          <Loader2 className="zxgj-login-loading" />
        </section>
        <LoginStyles />
      </main>
    );
  }

  return (
    <main className="zxgj-login-page">
      <LoginVisual />
      <section className="zxgj-login-panel" aria-label="账号登录">
        <div className="zxgj-login-form-wrap">
          <div className="zxgj-login-heading">
            <h1>登录</h1>
          </div>

          <form onSubmit={handleLogin} className="zxgj-login-form">
            {error ? <div className="zxgj-login-error">{error}</div> : null}

            <label className="zxgj-login-field">
              <span>手机号 / 账号</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="请输入账号"
              />
            </label>

            <label className="zxgj-login-field">
              <span>密码</span>
              <div className="zxgj-login-password">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            <div className="zxgj-login-row">
              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => handleRememberChange(event.target.checked)}
                />
                记住密码
              </label>
              <a href="#">忘记密码</a>
            </div>

            <button type="submit" disabled={loading} className="zxgj-login-submit">
              <span>
                {loading ? <Loader2 /> : null}
                {loading ? "登录中..." : "进入项目"}
              </span>
              <ArrowUpRight />
            </button>
          </form>
        </div>

        <div className="zxgj-login-panel-meta">
          <span>ARCHITECTURE</span>
          <i />
          <span>INTERIOR</span>
          <i />
          <span>CONSTRUCTION</span>
        </div>
      </section>
      <LoginStyles />
    </main>
  );
}

function LoginStyles() {
  return (
    <style jsx global>{`
      .zxgj-login-page {
        display: grid;
        min-height: 100dvh;
        grid-template-columns: minmax(0, 1.15fr) minmax(430px, .85fr);
        overflow: hidden;
        background: #f3f5f5;
        color: #17201b;
        font-family: "Geist", "Plus Jakarta Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      .zxgj-login-visual {
        position: relative;
        min-height: 100dvh;
        overflow: hidden;
        background: #1d2b3d;
      }

      .zxgj-login-visual > img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: 62% center;
        filter: saturate(.68) contrast(1.05);
      }

      .zxgj-login-visual-wash {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(90deg, rgba(12,25,43,.82), rgba(12,25,43,.24) 62%, rgba(12,25,43,.54)),
          linear-gradient(180deg, rgba(12,25,43,.3), rgba(12,25,43,.52));
      }

      .zxgj-login-visual::after {
        position: absolute;
        inset: 0;
        opacity: .18;
        background-image:
          linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px);
        background-size: 36px 36px;
        content: "";
      }

      .zxgj-login-brand {
        position: absolute;
        z-index: 2;
        top: 42px;
        left: 48px;
        display: inline-flex;
        align-items: center;
        gap: 11px;
        color: #fff;
        font-size: 15px;
        font-weight: 760;
        line-height: 1;
      }

      .zxgj-login-brand img {
        display: block;
        width: 34px;
        height: 34px;
        object-fit: contain;
      }

      .zxgj-login-visual-foot {
        position: absolute;
        z-index: 2;
        left: 48px;
        bottom: 42px;
        display: flex;
        align-items: center;
        gap: 18px;
      }

      .zxgj-login-swatches {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .zxgj-login-swatches i {
        display: block;
        width: 28px;
        height: 28px;
        border: 1px solid rgba(255,255,255,.2);
        border-radius: 4px;
      }

      .zxgj-login-swatches .swatch-wood {
        background-image: linear-gradient(90deg, #9f7650, #d0aa83 48%, #9b704b);
      }

      .zxgj-login-swatches .swatch-stone {
        background: #d5d2ca;
      }

      .zxgj-login-swatches .swatch-metal {
        background: linear-gradient(135deg, #8a9397, #e5e8e8 48%, #737d80);
      }

      .zxgj-login-swatches .swatch-fabric {
        background: #596157;
      }

      .zxgj-login-visual-foot > span {
        color: rgba(255,255,255,.56);
        font-size: 9px;
        font-weight: 750;
        letter-spacing: .14em;
      }

      .zxgj-login-panel {
        position: relative;
        display: flex;
        min-height: 100dvh;
        flex-direction: column;
        justify-content: center;
        padding: 56px clamp(44px, 7vw, 100px) 34px;
      }

      .zxgj-login-panel-loading {
        align-items: center;
      }

      .zxgj-login-loading {
        width: 30px;
        height: 30px;
        color: #2255a4;
        animation: zxgj-login-spin .8s linear infinite;
      }

      @keyframes zxgj-login-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .zxgj-login-form-wrap {
        width: 100%;
        max-width: 370px;
        margin: auto;
      }

      .zxgj-login-heading {
        margin-bottom: 42px;
      }

      .zxgj-login-heading h1 {
        margin: 0;
        color: #142039;
        font-size: clamp(40px, 4vw, 56px);
        font-weight: 650;
        line-height: 1;
        letter-spacing: 0;
      }

      .zxgj-login-form {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .zxgj-login-error {
        border: 1px solid #f0b9b9;
        border-radius: 8px;
        background: #fff3f3;
        padding: 10px 14px;
        color: #b42318;
        font-size: 13px;
        line-height: 1.5;
      }

      .zxgj-login-field {
        display: block;
      }

      .zxgj-login-field > span {
        display: block;
        margin-bottom: 9px;
        color: #5b6760;
        font-size: 12px;
        font-weight: 700;
      }

      .zxgj-login-field input {
        width: 100%;
        height: 52px;
        border: 1px solid #d7ddda;
        border-radius: 8px;
        outline: 0;
        background: #fff;
        padding: 0 16px;
        color: #17201b;
        font: inherit;
        font-size: 14px;
        transition: border-color .28s ease, box-shadow .28s ease;
      }

      .zxgj-login-field input::placeholder {
        color: #9ba49f;
      }

      .zxgj-login-field input:focus {
        border-color: #2556a5;
        box-shadow: 0 0 0 4px rgba(37,86,165,.1);
      }

      .zxgj-login-password {
        position: relative;
      }

      .zxgj-login-password input {
        padding-right: 48px;
      }

      .zxgj-login-password button {
        position: absolute;
        top: 50%;
        right: 13px;
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border: 0;
        border-radius: 50%;
        background: transparent;
        padding: 0;
        color: #7d8a83;
        cursor: pointer;
        transform: translateY(-50%);
      }

      .zxgj-login-password button:hover {
        background: rgba(23,32,27,.05);
        color: #17201b;
      }

      .zxgj-login-password button svg {
        width: 16px;
        height: 16px;
      }

      .zxgj-login-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 2px 0 4px;
        color: #6f7b75;
        font-size: 12px;
      }

      .zxgj-login-row label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .zxgj-login-row input {
        width: auto;
        height: auto;
        accent-color: #2255a4;
      }

      .zxgj-login-row a {
        color: inherit;
        font-weight: 650;
        text-decoration: none;
      }

      .zxgj-login-row a:hover {
        color: #17201b;
      }

      .zxgj-login-submit {
        display: flex;
        width: 100%;
        height: 54px;
        align-items: center;
        justify-content: space-between;
        border: 0;
        border-radius: 8px;
        background: #2255a4;
        padding: 0 17px 0 19px;
        color: #fff;
        font: inherit;
        font-size: 14px;
        font-weight: 760;
        cursor: pointer;
        transition: transform .28s ease, filter .28s ease;
      }

      .zxgj-login-submit:hover {
        filter: brightness(.94);
        transform: translateY(-1px);
      }

      .zxgj-login-submit:active {
        transform: translateY(0) scale(.995);
      }

      .zxgj-login-submit:disabled {
        cursor: not-allowed;
        opacity: .68;
      }

      .zxgj-login-submit span {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .zxgj-login-submit svg {
        width: 18px;
        height: 18px;
      }

      .zxgj-login-submit:disabled svg {
        animation: zxgj-login-spin .8s linear infinite;
      }

      .zxgj-login-panel-meta {
        position: absolute;
        left: clamp(44px, 7vw, 100px);
        right: clamp(44px, 7vw, 100px);
        bottom: 34px;
        display: flex;
        align-items: center;
        gap: 7px;
        color: #9ca7a1;
        font-size: 8px;
        font-weight: 750;
        letter-spacing: .1em;
      }

      .zxgj-login-panel-meta i {
        width: 2px;
        height: 2px;
        border-radius: 50%;
        background: #b9c1bd;
      }

      @media (max-width: 960px) {
        .zxgj-login-page {
          grid-template-columns: 1fr;
          overflow: auto;
        }

        .zxgj-login-visual {
          min-height: 38dvh;
        }

        .zxgj-login-brand {
          top: 26px;
          left: 26px;
        }

        .zxgj-login-visual-foot {
          right: 26px;
          bottom: 26px;
          left: 26px;
          justify-content: space-between;
        }

        .zxgj-login-panel {
          min-height: 62dvh;
          padding: 48px 26px 88px;
        }

        .zxgj-login-panel-meta {
          left: 26px;
          right: 26px;
          bottom: 28px;
        }
      }

      @media (max-width: 560px) {
        .zxgj-login-panel {
          padding-right: 20px;
          padding-left: 20px;
        }

        .zxgj-login-panel-meta {
          left: 20px;
          right: 20px;
        }

        .zxgj-login-heading {
          margin-bottom: 34px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .zxgj-login-field input,
        .zxgj-login-submit {
          transition: none;
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
