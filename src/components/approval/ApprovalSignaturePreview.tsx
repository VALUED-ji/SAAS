import NativeImage from "@/components/ui/NativeImage";

export default function ApprovalSignaturePreview({ step, compact = false }: { step: any; compact?: boolean }) {
  if (!step?.signature_url) return null;
  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <span className={`approval-signature-preview flex items-center justify-start ${compact ? "h-10 w-24" : "h-14 w-32"}`}>
        <NativeImage src={step.signature_url} alt="审批签名" className="h-full w-full object-contain object-left" />
      </span>
    </div>
  );
}
