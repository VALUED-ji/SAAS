"use client";

import { useParams } from "next/navigation";
import VrTourExperience from "@/components/VrTourExperience";

export default function VrTourPage() {
  const params = useParams<{ id: string }>();
  const tourId = params.id;

  return <VrTourExperience loadUrl={`/api/vr-tours/${encodeURIComponent(tourId)}`} shareMode="create" shareTourId={tourId} />;
}
