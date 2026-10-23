type Delivery = { name?: string; email?: string; phone?: string; shipping?: string; street?: string; city?: string; zip?: string };
export default function DeliveryDetails({ details }: { details?: Delivery | null }) {
  if (!details) return null;
  return <div className="space-y-1 text-xs whitespace-normal break-words">
    <p className="font-semibold">Příjemce a doručení</p>
    <p>{details.name}</p>
    {details.phone && <p><a href={`tel:${details.phone}`} className="text-primary underline">{details.phone}</a></p>}
    {details.email && <p><a href={`mailto:${details.email}`} className="text-primary underline">{details.email}</a></p>}
    <p>{details.shipping === "pickup" ? "Osobní odběr" : details.shipping === "dpd" ? "DPD" : "Zásilkovna"}</p>
    {details.shipping !== "pickup" && <p>{details.street}, {details.city} {details.zip}</p>}
  </div>;
}