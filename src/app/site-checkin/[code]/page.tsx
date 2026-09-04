"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Camera, CheckCircle, Clock, ImageIcon, LogIn, Loader2, MapPin, Phone, UserCheck, UserRound, X } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import SystemSelect from "@/components/ui/SystemSelect";
import NativeImage from "@/components/ui/NativeImage";

export default function SiteCheckinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = decodeURIComponent(params.code || "");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [externalMode, setExternalMode] = useState(false);
  const [photos, setPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const photosRef = useRef(photos);
  const [form, setForm] = useState({
    person_name: "",
    phone: "",
    role: "施工人员",
    company_name: "",
    remark: "",
    location_name: "",
    latitude: "",
    longitude: "",
  });
  const currentUser = data?.current_user || null;

  const getPhoneLocation = async (silent = false) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (!silent) setMessage("当前浏览器不支持定位，无法签到");
      return null;
    }
    setLocating(true);
    if (!silent) setMessage("正在获取手机定位...");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
      });
      let nextLocation = {
        location_name: "已获取当前位置",
        latitude: String(position.coords.latitude),
        longitude: String(position.coords.longitude),
      };
      try {
        const response = await fetch(`/api/location/reverse?lat=${encodeURIComponent(position.coords.latitude)}&lng=${encodeURIComponent(position.coords.longitude)}`);
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          const amapLatitude = Number(result?.amap_latitude);
          const amapLongitude = Number(result?.amap_longitude);
          nextLocation = {
            location_name: String(result?.location_name || result?.location_address || "已获取当前位置"),
            latitude: String(Number.isFinite(amapLatitude) ? amapLatitude : position.coords.latitude),
            longitude: String(Number.isFinite(amapLongitude) ? amapLongitude : position.coords.longitude),
          };
        }
      } catch {
        // 反向解析失败时仍保留浏览器定位，后端会继续做范围校验。
      }
      setForm((current) => ({
        ...current,
        location_name: current.location_name || nextLocation.location_name,
        latitude: nextLocation.latitude,
        longitude: nextLocation.longitude,
      }));
      if (!silent) setMessage("");
      return nextLocation;
    } catch (error: any) {
      if (!silent) {
        setMessage(error?.code === 1 ? "定位权限被拒绝，请允许手机获取定位后再签到" : "获取手机定位失败，请移动到开阔位置后重试");
      }
      return null;
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/site-checkin/${encodeURIComponent(code)}`);
        const next = await res.json();
        if (!res.ok) throw new Error(next.message || "签到码加载失败");
        setData(next);
      } catch (err: any) {
        setMessage(err.message || "签到码加载失败");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [code]);

  const submit = async () => {
    if (!currentUser && !externalMode) {
      setMessage("请先登录员工账号，或选择外部人员签到");
      return;
    }
    if (externalMode && !form.person_name.trim()) {
      setMessage("请填写签到人姓名");
      return;
    }
    if (!data?.has_site_location) {
      setMessage("该客户资料未保存实际地址定位，请先联系门店在客户资料中通过地图选点保存");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      let submitForm = form;
      if (!form.latitude || !form.longitude) {
        const location = await getPhoneLocation();
        if (!location) return;
        submitForm = { ...form, ...location };
      }
      const payload = new FormData();
      Object.entries(submitForm).forEach(([key, value]) => payload.append(key, String(value || "")));
      payload.append("checkin_mode", externalMode ? "external" : "employee");
      photos.forEach((photo) => payload.append("photos", photo.file));
      const res = await fetch(`/api/site-checkin/${encodeURIComponent(code)}`, {
        method: "POST",
        body: payload,
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(result.message || "签到失败");
        return;
      }
      if (externalMode) {
        localStorage.setItem("zxgj_site_checkin_external_profile", JSON.stringify({
          person_name: form.person_name,
          phone: form.phone,
          role: form.role,
          company_name: form.company_name,
        }));
      }
      setData((current: any) => ({
        ...current,
        person_checkin_count: Number(result.person_checkin_count || 0),
        person_latest_signed_at: result.person_latest_signed_at || null,
        signed_person_name: String(result.person_name || "").trim(),
      }));
      setDone(true);
      setMessage("签到成功");
    } finally {
      setSaving(false);
    }
  };

  const addPhotos = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const nextFiles = Array.from(fileList);
    const validFiles: File[] = [];
    for (const file of nextFiles) {
      if (!file.type.startsWith("image/")) {
        setMessage("只能上传现场照片");
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        setMessage("单张照片不能超过8MB");
        continue;
      }
      validFiles.push(file);
    }
    setPhotos((current) => {
      const availableCount = Math.max(0, 6 - current.length);
      if (validFiles.length > availableCount) setMessage("最多上传6张现场照片");
      return [
        ...current,
        ...validFiles.slice(0, availableCount).map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ];
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

  useEffect(() => {
    if (!externalMode) return;
    try {
      const stored = JSON.parse(localStorage.getItem("zxgj_site_checkin_external_profile") || "{}");
      setForm((current) => ({
        ...current,
        person_name: current.person_name || String(stored.person_name || ""),
        phone: current.phone || String(stored.phone || ""),
        role: current.role || String(stored.role || "施工人员"),
        company_name: current.company_name || String(stored.company_name || ""),
      }));
    } catch {
      // 本机没有外部人员历史记录时保持空表单。
    }
  }, [externalMode]);

  const goLogin = () => {
    const redirect = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search || ""}`
      : `/site-checkin/${encodeURIComponent(code)}`;
    router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
  };
  const checkinPersonName = String(data?.signed_person_name || currentUser?.name || form.person_name || "").trim();
  const ownCheckinCount = done
    ? Number(data?.person_checkin_count || 0)
    : currentUser
      ? Number(data?.current_user_checkin_count || 0)
      : 0;
  const ownLatestSignedAt = done
    ? data?.person_latest_signed_at
    : currentUser
      ? data?.current_user_latest_signed_at
      : null;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef4f2] text-surface-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        正在打开工地签到...
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef4f2] px-5">
        <div className="w-full max-w-sm rounded-2xl border border-red-100 bg-white p-6 text-center shadow-[0_20px_60px_rgba(31,41,53,0.12)]">
          <p className="font-semibold text-red-600">{message || "签到码不存在"}</p>
          <p className="mt-2 text-sm leading-6 text-surface-500">请确认二维码是否完整，或联系项目经理重新打印签到码。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eaf3ef] px-4 py-6 text-surface-900">
      <div className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_26px_80px_rgba(15,23,42,0.18)]">
        <section className="bg-[linear-gradient(135deg,#0f766e,#111827)] px-6 py-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">{data.company_name || "装修管家"}</p>
          <h1 className="mt-3 text-2xl font-semibold leading-tight">{data.project_name || "工地签到"}</h1>
          <p className="mt-2 flex items-start gap-1.5 text-sm leading-6 text-white/75">
            <MapPin className="mt-1 h-3.5 w-3.5 shrink-0" />
            <span>{data.project_address || "请确认到达工地现场后再提交签到"}</span>
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <SmallStat label="签到人姓名" value={checkinPersonName || "未识别"} />
            <SmallStat label="签到次数" value={ownCheckinCount} />
            <SmallStat label="最近签到" value={formatDateTime(ownLatestSignedAt)} />
          </div>
        </section>

        {done ? (
          <section className="px-6 py-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle className="h-9 w-9" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-surface-900">签到成功</h2>
            <p className="mt-2 text-sm leading-6 text-surface-500">后台已记录你的签到信息，项目经理可以在工地详情中查看。</p>
          </section>
        ) : (
          <section className="space-y-4 px-5 py-5">
            {currentUser ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                  <UserCheck className="h-3.5 w-3.5" />
                  已识别当前员工
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-base font-black text-emerald-700 shadow-sm">
                    {String(currentUser.name || "员").slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-surface-900">{currentUser.name || "当前员工"}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-surface-500">
                      {currentUser.role_name || "员工"}{currentUser.phone ? ` · ${currentUser.phone}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            ) : externalMode ? (
              <>
                <div className="flex items-center justify-between rounded-2xl border border-surface-200 bg-surface-50 px-3 py-2">
                  <p className="text-xs font-semibold text-surface-500">外部人员签到</p>
                  <button type="button" onClick={() => setExternalMode(false)} className="rounded-lg px-2 py-1 text-xs font-bold text-[#0f766e] hover:bg-white">
                    改为员工登录
                  </button>
                </div>
                <Field icon={UserRound} label="姓名" required>
                  <input value={form.person_name} onChange={(event) => setForm((current) => ({ ...current, person_name: event.target.value }))} className="h-11 w-full rounded-xl border border-surface-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50" placeholder="请输入姓名" />
                </Field>
                <Field icon={Phone} label="手机号">
                  <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="h-11 w-full rounded-xl border border-surface-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50" inputMode="tel" placeholder="便于后台核对人员" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field icon={UserRound} label="身份">
                    <SystemSelect value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} className="h-11 w-full rounded-xl border border-surface-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50">
                      <option>施工人员</option>
                      <option>项目经理</option>
                      <option>设计师</option>
                      <option>监理</option>
                      <option>材料商</option>
                      <option>业主</option>
                      <option>其他</option>
                    </SystemSelect>
                  </Field>
                  <Field icon={Clock} label="单位/班组">
                    <input value={form.company_name} onChange={(event) => setForm((current) => ({ ...current, company_name: event.target.value }))} className="h-11 w-full rounded-xl border border-surface-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50" placeholder="例如水电班组" />
                  </Field>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-[#dce8f8] bg-[#f8fbff] px-4 py-4">
                  <p className="text-sm font-black text-surface-900">公司员工登录后签到</p>
                  <p className="mt-1 text-xs leading-5 text-surface-500">登录一次后，后续扫码会自动识别姓名和手机号。</p>
                </div>
                <button type="button" onClick={goLogin} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#407AFF] text-sm font-semibold text-white shadow-[0_14px_30px_rgba(64,122,255,0.22)] transition hover:bg-[#2F66E8]">
                  <LogIn className="h-4 w-4" />
                  员工登录签到
                </button>
                <button type="button" onClick={() => setExternalMode(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-surface-200 bg-white text-sm font-semibold text-surface-700 transition hover:bg-surface-50">
                  外部人员签到
                </button>
              </div>
            )}
            {(currentUser || externalMode) && (
              <div className="rounded-2xl border border-surface-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-surface-600">
                      <Camera className="h-3.5 w-3.5 text-surface-400" />
                      现场照片
                    </p>
                    <p className="mt-1 text-xs text-surface-400">可拍照或从相册选择，最多6张</p>
                  </div>
                  <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#edf4ff] px-3 text-xs font-bold text-[#407AFF] transition hover:bg-[#e4ebff]">
                    <ImageIcon className="h-3.5 w-3.5" />
                    添加照片
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        addPhotos(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {photos.map((photo, index) => (
                      <div key={`${photo.previewUrl}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-surface-200 bg-surface-50">
                        <NativeImage src={photo.previewUrl} alt={`现场照片${index + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"
                          aria-label="删除照片"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Field icon={MapPin} label="现场备注">
              <textarea value={form.remark} onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))} className="min-h-24 w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50" placeholder="可填写今日到场事项、材料送达、施工安排等" />
            </Field>
            {form.location_name && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {form.location_name}
              </div>
            )}
            {!data.has_site_location && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                客户资料尚未保存实际地址定位，请联系门店在客户资料中通过地图选点保存后再签到。
              </div>
            )}
            {message && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{message}</p>}
            {(currentUser || externalMode) && (
              <button type="button" onClick={submit} disabled={saving || locating || data.status !== "active" || !data.has_site_location} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0f766e] text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,118,110,0.26)] transition hover:bg-[#115e59] disabled:opacity-50">
                {(saving || locating) && <Loader2 className="h-4 w-4 animate-spin" />}
                {data.status === "active" ? currentUser ? "确认签到" : "提交签到" : "签到码已停用"}
              </button>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function SmallStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-2">
      <p className="text-[11px] text-white/55">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function Field({ icon: Icon, label, required, children }: { icon: any; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-surface-600">
        <Icon className="h-3.5 w-3.5 text-surface-400" />
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
