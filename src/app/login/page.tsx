"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getAuthorizedRedirectPath } from "@/lib/menuAccess";

const REMEMBER_LOGIN_KEY = "zxgj_remembered_login";
const SESSION_EXPIRED_STORAGE_KEY = "zxgj_session_expired_message";
const SESSION_EXPIRED_MESSAGE = "登录已过期，请重新登录";
const LOGIN_HERO_AVIF = "/brand/login-palace-c-20260918.avif";
const LOGIN_HERO_WEBP = "/brand/login-palace-c-20260918.webp";
const LOGIN_HERO_JPEG = "/brand/login-palace-c-20260918.jpg";
const LOGIN_HERO_PLACEHOLDER =
  "data:image/webp;base64,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";
const LOGIN_HERO_PLACEHOLDER_STYLE = {
  backgroundColor: "#2b1712",
  backgroundImage: `url("${LOGIN_HERO_PLACEHOLDER}")`,
  backgroundPosition: "center",
  backgroundSize: "cover",
} as const;

function LoginHero() {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <div className={`zxgj-login-hero${loaded ? " is-loaded" : ""}`} aria-hidden="true">
      <picture>
        <source srcSet={LOGIN_HERO_AVIF} type="image/avif" />
        <source srcSet={LOGIN_HERO_WEBP} type="image/webp" />
        <img
          ref={imageRef}
          src={LOGIN_HERO_JPEG}
          alt=""
          decoding="async"
          fetchPriority="high"
          onLoad={() => setLoaded(true)}
        />
      </picture>
    </div>
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

  const handleLogin = async (e: FormEvent) => {
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
      <main className="zxgj-login-page" style={LOGIN_HERO_PLACEHOLDER_STYLE}>
        <LoginHero />
        <LoginStyles />
        <Loader2 className="zxgj-login-loading" />
      </main>
    );
  }

  return (
    <main className="zxgj-login-page" style={LOGIN_HERO_PLACEHOLDER_STYLE}>
      <LoginHero />
      <LoginStyles />
      <section className="zxgj-login-shell" aria-label="账号登录">
        <div className="zxgj-login-panel">
          <div className="zxgj-login-panel-inner">
            <div className="zxgj-login-head">
              <div className="zxgj-login-kicker">Rose will bloom ail the time.</div>
              <div className="zxgj-login-title">
                {/* eslint-disable-next-line @next/next/no-img-element -- Login branding is a fixed public asset. */}
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

      @font-face {
        font-family: "ZxgjLoginScript";
        src: url("/fonts/kalam-700.ttf") format("truetype");
        font-style: normal;
        font-weight: 700;
        font-display: swap;
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

      .zxgj-login-hero {
        position: absolute;
        z-index: 0;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
      }

      .zxgj-login-hero::after {
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, rgba(65,13,9,.34) 0%, rgba(65,13,9,.04) 45%, rgba(255,251,239,.08) 100%);
        content: "";
      }

      .zxgj-login-hero picture {
        display: block;
        width: 100%;
        height: 100%;
      }

      .zxgj-login-hero img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
        opacity: 0;
        transition: opacity .42s var(--zxgj-login-ease);
      }

      .zxgj-login-hero.is-loaded img {
        opacity: 1;
      }

      .zxgj-login-loading {
        position: absolute;
        z-index: 3;
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
        font-family: "ZxgjLoginScript", cursive;
        font-size: 17px;
        font-style: normal;
        font-weight: 700;
        letter-spacing: 0;
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

      @media (prefers-reduced-motion: reduce) {
        .zxgj-login-shell {
          opacity: 1;
          animation: none;
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
