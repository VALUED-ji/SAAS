"use client";

import { useParams } from "next/navigation";
import VrTourExperience from "@/components/VrTourExperience";

export default function VrSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  return <VrTourExperience loadUrl={`/api/vr-shares/${encodeURIComponent(token)}`} shareMode="current" />;
}
