import { Badge } from "@/components/ui/badge";

export default function BookingDetails({ booking: b }: { booking: any }) {
  const date = (s: string | null) => s ? new Date(s).toLocaleDateString("cs-CZ") : "Dosud nepotvrzeno";
  return <dl className="space-y-2 text-xs break-words">
    <div><dt className="text-muted-foreground">Poznámka zákazníka</dt><dd className="whitespace-pre-wrap">{b.note || "Bez poznámky"}</dd></div>
    <div><dt className="text-muted-foreground">Odpověď servisu</dt><dd className="whitespace-pre-wrap">{b.admin_note || "Dosud bez odpovědi"}</dd></div>
    <div><dt className="text-muted-foreground">Požadovaný termín</dt><dd>{date(b.preferred_date)}</dd></div>
    <div><dt className="text-muted-foreground">Potvrzený termín</dt><dd>{date(b.confirmed_date)}</dd></div>
    <div><dt className="text-muted-foreground">Náhradní vozidlo</dt><dd>{b.wants_replacement_vehicle ? (b.replacement_vehicle_confirmed == null ? "Požadováno, čeká na potvrzení" : b.replacement_vehicle_confirmed ? "Potvrzeno" : "Nepotvrzeno") : "Nepožadováno"}</dd></div>
    <div><dt className="text-muted-foreground">Odhad ceny / konečná cena</dt><dd>{b.estimated_price != null ? `${Number(b.estimated_price).toLocaleString("cs")} Kč` : "Dosud neurčeno"} / {b.final_price != null ? `${Number(b.final_price).toLocaleString("cs")} Kč` : "Dosud neurčeno"}</dd></div>
    {b.discount_amount != null && <div><dt className="text-muted-foreground">Sleva</dt><dd>{Number(b.discount_amount).toLocaleString("cs")} Kč</dd></div>}
    {b.created_at && <div><dt className="text-muted-foreground">Vytvořeno</dt><dd>{new Date(b.created_at).toLocaleString("cs-CZ")}</dd></div>}
    {b.archived_at && <Badge variant="outline">Archivováno {date(b.archived_at)}</Badge>}
  </dl>;
}