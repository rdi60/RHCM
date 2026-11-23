"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { TaxProfileRow, TreatmentCatalogRow } from "@/lib/types";
import { EstimatesSection } from "./estimates-section";
import { InvoicesSection } from "./invoices-section";
import { PaymentsSection } from "./payments-section";
import { CreditNotesSection } from "./credit-notes-section";
import { RefundsSection } from "./refunds-section";

export function BillingTab({ patientId }: { patientId: string }) {
  const { selectedEntityId } = useAuth();

  const catalogQuery = useQuery({
    queryKey: ["treatment-catalog"],
    queryFn: () => api.get<TreatmentCatalogRow[]>("/treatment-catalog"),
  });
  const taxProfilesQuery = useQuery({
    queryKey: ["tax-profiles", selectedEntityId],
    queryFn: () => api.get<TaxProfileRow[]>(`/entities/${selectedEntityId}/tax-profiles`),
    enabled: Boolean(selectedEntityId),
  });

  const catalog = catalogQuery.data ?? [];
  const taxProfiles = (taxProfilesQuery.data ?? []).filter((t) => t.isActive);

  return (
    <div className="flex flex-col gap-4">
      <EstimatesSection patientId={patientId} catalog={catalog} taxProfiles={taxProfiles} />
      <InvoicesSection patientId={patientId} catalog={catalog} taxProfiles={taxProfiles} />
      <PaymentsSection patientId={patientId} />
      <CreditNotesSection patientId={patientId} />
      <RefundsSection patientId={patientId} />
    </div>
  );
}
