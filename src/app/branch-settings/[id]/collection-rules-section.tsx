// 分公司设置-收款规则区块组件
// 从 page.tsx 渐进拆出的收款方案配置区块。

"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ImageIcon, Loader2, Plus, QrCode, Trash2, Upload, X } from "lucide-react";
import NativeImage from "@/components/ui/NativeImage";
import { TextField } from "./branch-settings-fields";
import type { BranchSettings, PaymentScheme, PaymentStage } from "@/lib/branchSettings";
export function CollectionRulesSection({
  branchId,
  collectionRules,
  onSchemesChange,
  onPaymentSettingChange,
}: {
  branchId: string;
  collectionRules: BranchSettings["collectionRules"];
  onSchemesChange: (schemes: PaymentScheme[]) => void;
  onPaymentSettingChange: <F extends keyof BranchSettings["collectionRules"]>(
    field: F,
    value: BranchSettings["collectionRules"][F]
  ) => void;
}) {
  const schemes = collectionRules.schemes;
  const [expandedId, setExpandedId] = useState(schemes[0]?.id || "");
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  useEffect(() => {
    if (!expandedId) return; // 允许全部折叠
    if (schemes.some((scheme) => scheme.id === expandedId)) return;
    setExpandedId(schemes[0]?.id || "");
  }, [schemes, expandedId]);

  const updateScheme = (schemeId: string, patch: Partial<PaymentScheme>) => {
    onSchemesChange(schemes.map((scheme) => scheme.id === schemeId ? { ...scheme, ...patch } : scheme));
  };

  const updateStages = (schemeId: string, stages: PaymentStage[]) => {
    onSchemesChange(schemes.map((scheme) => scheme.id === schemeId ? { ...scheme, stages } : scheme));
  };

 const addScheme = () => {
    const nextScheme: PaymentScheme = {
      id: `SCHEME_${Date.now()}`,
      name: `收款方案 ${schemes.length + 1}`,
      isDefault: schemes.length === 0,
      stages: [
        { id: `STAGE_${Date.now()}_1`, name: "签约款", ratio: 30, trigger: "合同签订" },
        { id: `STAGE_${Date.now()}_2`, name: "开工款", ratio: 30, trigger: "开工交底" },
        { id: `STAGE_${Date.now()}_3`, name: "尾款", ratio: 40, trigger: "竣工验收" },
      ],
    };
    onSchemesChange([...schemes, nextScheme]);
    setExpandedId(nextScheme.id);
  };

  const deleteScheme = (schemeId: string) => {
    const remaining = schemes.filter((scheme) => scheme.id !== schemeId);
    if (remaining.length > 0 && !remaining.some((scheme) => scheme.isDefault)) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }
    onSchemesChange(remaining);
  };

  const setDefaultScheme = (schemeId: string) => {
    onSchemesChange(schemes.map((scheme) => ({ ...scheme, isDefault: scheme.id === schemeId })));
  };

  const addStage = (schemeId: string) => {
    const scheme = schemes.find((item) => item.id === schemeId);
    if (!scheme) return;
    updateStages(schemeId, [
      ...scheme.stages,
      {
        id: `STAGE_${Date.now()}`,
        name: `阶段${scheme.stages.length + 1}`,
        ratio: 0,
        trigger: "",
      },
    ]);
  };

 const updateStage = (schemeId: string, stageId: string, patch: Partial<PaymentStage>) => {
    const scheme = schemes.find((item) => item.id === schemeId);
    if (!scheme) return;
    const updatedStages = scheme.stages.map((stage) =>
      stage.id === stageId ? { ...stage, ...patch } : stage
    );
    if (patch.ratio !== undefined && updatedStages.length > 0) {
      const nonLast = updatedStages.slice(0, -1);
      const nonLastSum = nonLast.reduce((sum, st) => sum + Number(st.ratio || 0), 0);
      const last = updatedStages[updatedStages.length - 1];
      last.ratio = Math.max(0, 100 - nonLastSum);
    }
    updateStages(schemeId, updatedStages);
  };

 const removeStage = (schemeId: string, stageId: string) => {
    const scheme = schemes.find((item) => item.id === schemeId);
    if (!scheme) return;
    const filtered = scheme.stages.filter((stage) => stage.id !== stageId);
    if (filtered.length > 0) {
      const nonLastSum = filtered.slice(0, -1).reduce((sum, st) => sum + Number(st.ratio || 0), 0);
      filtered[filtered.length - 1] = { ...filtered[filtered.length - 1], ratio: Math.max(0, 100 - nonLastSum) };
    }
    updateStages(schemeId, filtered);
  };

  const uploadQrCode = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadMessage("请上传图片格式的收款码");
      return;
    }
    setUploadingQr(true);
    setUploadMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("org_unit_id", branchId);
      formData.append("category", "收款码");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "上传失败");
      onPaymentSettingChange("paymentQrCodeUrl", data.file_url || "");
      if (!collectionRules.paymentQrCodeName) {
        onPaymentSettingChange("paymentQrCodeName", "分公司收款码");
      }
      setUploadMessage("收款码已上传，请记得保存设置");
    } catch (err: any) {
      setUploadMessage(err.message || "上传失败");
    } finally {
      setUploadingQr(false);
    }
  };

  return (
    <div className="branch-collection-workspace space-y-4">
    <div className="branch-settings-panel branch-collection-qr-panel rounded-lg border border-surface-200/90 bg-white/95 p-5 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-surface-900">扫码收款配置</p>
          <p className="mt-1 text-sm text-surface-500">用于客户定金记录中的扫码支付，按客户所属分公司展示对应收款码。</p>
        </div>
        {collectionRules.paymentQrCodeUrl && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <QrCode className="h-3.5 w-3.5" />
            已配置
          </span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-lg border border-dashed border-surface-200 bg-surface-50/70 p-4">
          {collectionRules.paymentQrCodeUrl ? (
            <div className="space-y-3">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-white p-3">
                <NativeImage src={collectionRules.paymentQrCodeUrl} alt="分公司收款码" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex items-center gap-2">
                <label className="btn-secondary h-10 min-h-10 flex-1 cursor-pointer justify-center py-0">
                  {uploadingQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  更换
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => uploadQrCode(event.target.files?.[0])} />
                </label>
                <button
                  type="button"
                  className="flex h-10 min-h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white p-0 text-surface-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => onPaymentSettingChange("paymentQrCodeUrl", "")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <label className="flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-lg bg-white text-center text-surface-400 transition-colors hover:bg-surface-50">
              {uploadingQr ? <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary-500" /> : <ImageIcon className="mb-3 h-9 w-9 text-surface-300" />}
              <span className="text-sm font-semibold text-surface-700">{uploadingQr ? "上传中..." : "上传收款码"}</span>
              <span className="mt-1 text-xs text-surface-400">支持 jpg、png、webp</span>
              <input type="file" accept="image/*" className="hidden" onChange={(event) => uploadQrCode(event.target.files?.[0])} />
            </label>
          )}
          {uploadMessage && (
            <p className={`mt-3 text-xs ${uploadMessage.includes("已上传") ? "text-emerald-600" : "text-red-600"}`}>
              {uploadMessage}
            </p>
          )}
        </div>

        <div className="grid content-start gap-4 md:grid-cols-2">
          <TextField
            label="收款码名称"
            value={collectionRules.paymentQrCodeName}
            onChange={(value) => onPaymentSettingChange("paymentQrCodeName", value)}
            placeholder="例如：广州分公司微信收款码"
          />
          <TextField
            label="收款账户/收款人"
            value={collectionRules.paymentAccountName}
            onChange={(value) => onPaymentSettingChange("paymentAccountName", value)}
            placeholder="例如：广州某某装饰工程有限公司"
          />
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-surface-700">扫码支付说明</span>
            <textarea
              value={collectionRules.paymentQrNote}
              onChange={(event) => onPaymentSettingChange("paymentQrNote", event.target.value)}
              className="input-field min-h-[96px] resize-y"
              placeholder="例如：付款后请让客户备注姓名和小区房号，并上传付款截图。"
            />
          </label>
          <div className="md:col-span-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            扫码支付不会自动判断银行到账，客户详情里仍需点击“确认已收款”生成定金记录，便于财务复核。
          </div>
        </div>
      </div>
    </div>

    <div className="rounded-lg border border-surface-200/90 bg-white/95 p-5 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-surface-900">合同收款方案</p>
          <p className="mt-1 text-sm text-surface-500">配置多套收款方案模板，每套支持多期付款，合计必须为 100%。</p>
        </div>
        <button type="button" onClick={addScheme} className="btn-secondary">
          <Plus className="h-4 w-4" />
          新增方案
        </button>
      </div>

      <div className="space-y-4">
        {schemes.map((scheme) => {
          const expanded = expandedId === scheme.id;
          const totalRatio = scheme.stages.reduce((sum, stage) => sum + Number(stage.ratio || 0), 0);
          return (
            <div key={scheme.id} className="overflow-hidden rounded-lg border border-surface-200 bg-white">
              <div
                className="flex cursor-pointer flex-col gap-3 border-b border-surface-100 px-4 py-3 transition-colors hover:bg-surface-50/60 xl:flex-row xl:items-center"
                onClick={() => setExpandedId(expanded ? "" : scheme.id)}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-surface-400 transition-transform duration-200" style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                  <ChevronDown className="h-4 w-4" />
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3" onClick={(event) => event.stopPropagation()}>
                  <input
                    value={scheme.name}
                    onChange={(event) => updateScheme(scheme.id, { name: event.target.value })}
                    className="input-field min-h-9 max-w-64 py-1.5 font-semibold"
                  />
                  {scheme.isDefault && (
                    <span className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700">默认</span>
                  )}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-3" onClick={(event) => event.stopPropagation()}>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-surface-600">
                    <input
                      type="checkbox"
                      checked={scheme.isDefault}
                      onChange={() => setDefaultScheme(scheme.id)}
                      className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                    />
                    默认方案
                  </label>
                  <button
                    type="button"
                    onClick={() => deleteScheme(scheme.id)}
                    className="rounded-md border border-surface-200 bg-white p-2 text-surface-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div
                className="transition-all duration-300 ease-in-out"
                style={{
                  maxHeight: expanded ? '2000px' : '0',
                  opacity: expanded ? 1 : 0,
                  overflow: 'hidden',
                }}
              >
              <div className="space-y-5 px-4 py-4">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-surface-700">付款阶段</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          totalRatio === 100 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}>
                          合计 {totalRatio}%
                        </span>
                      </div>
                      <button type="button" onClick={() => addStage(scheme.id)} className="text-sm font-semibold text-primary-600 hover:text-primary-700">
                        + 添加阶段
                      </button>
                    </div>

                    <div className="space-y-2">
                      {scheme.stages.map((stage) => (
                        <div key={stage.id} className="grid items-center gap-2 rounded-lg border border-surface-100 bg-surface-50/50 p-3 xl:grid-cols-[minmax(180px,1fr)_92px_minmax(220px,1.2fr)_40px]">
                          <input
                            value={stage.name}
                            onChange={(event) => updateStage(scheme.id, stage.id, { name: event.target.value })}
                            className="input-field"
                            placeholder="阶段名称"
                          />
                          <div className="flex items-center rounded-lg border border-surface-200 bg-white focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-100/70">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={stage.ratio}
                              onChange={(event) => updateStage(scheme.id, stage.id, { ratio: Number(event.target.value || 0) })}
                              className="min-h-10 min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2 text-sm text-surface-800 outline-none"
                            />
                            <span className="shrink-0 border-l border-surface-100 px-3 text-xs font-medium text-surface-400">%</span>
                          </div>
                          <input
                            value={stage.trigger}
                            onChange={(event) => updateStage(scheme.id, stage.id, { trigger: event.target.value })}
                            className="input-field"
                            placeholder="触发条件，例如：合同签订"
                          />
                          <button
                            type="button"
                            onClick={() => removeStage(scheme.id, stage.id)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {schemes.length === 0 && (
          <div className="rounded-lg border border-dashed border-surface-200 py-16 text-center text-sm text-surface-400">
            暂无收款方案
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

